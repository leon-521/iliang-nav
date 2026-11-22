import { lookup } from "node:dns/promises";
import { request as httpRequest, type RequestOptions } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { BlockedHostError, DnsError, isPrivateAddress } from "../net/guard";

/** Strict allowlist for public routes; also rejects mapped/translation/tunnel prefixes. */
export function isPublicAddress(address: string): boolean {
  if (address.includes("%") || isPrivateAddress(address)) return false;
  if (isIP(address) === 4) {
    const [a, b, c] = address.split(".").map(Number);
    return !(a === 192 && (b === 0 || b === 88 || (b === 31 && c === 196) || (b === 52 && c === 193) || (b === 175 && c === 48))) &&
      !(a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) &&
      !(a === 203 && b === 0 && c === 113);
  }
  if (isIP(address) !== 6) return false;
  const [first, second] = address.split(":");
  const a = Number.parseInt(first, 16), b = Number.parseInt(second, 16) || 0;
  return a >= 0x2000 && a <= 0x3fff &&
    !(a === 0x2001 && (b < 0x200 || b === 0xdb8)) && a !== 0x2002 && a !== 0x3fff;
}

export function safeUrl(raw: string, httpsOnly = false): URL {
  if (!raw || raw.length > 2048) throw new BlockedHostError("地址格式不合法");
  let url: URL;
  try { url = new URL(raw); } catch { throw new BlockedHostError("地址格式不合法"); }
  if ((url.protocol !== "https:" && (httpsOnly || url.protocol !== "http:")) ||
      url.username || url.password || url.port) throw new BlockedHostError("只允许标准端口的公共 HTTP/HTTPS 地址，不允许内嵌凭据");
  const hostname = hostnameOf(url);
  if (isIP(hostname) ? !isPublicAddress(hostname) :
      hostname.length > 253 || !hostname.includes(".") ||
      /(?:^|\.)(localhost|local|internal|lan|home|onion|arpa|test|invalid|example)$/.test(hostname) ||
      hostname.split(".").some((part) => !/^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/i.test(part))) {
    throw new BlockedHostError();
  }
  return url;
}

function hostnameOf(url: URL) {
  return url.hostname.replace(/^\[|\]$|\.$/g, "").toLowerCase();
}

type Address = { address: string; family: number };
export type Resolver = (hostname: string) => Promise<Address[]>;
const resolveSystem: Resolver = (hostname) => lookup(hostname, { all: true });

export async function pinAddress(url: URL, resolve: Resolver = resolveSystem, signal?: AbortSignal) {
  const hostname = hostnameOf(safeUrl(url.href));
  const family = isIP(hostname);
  if (family) return { address: hostname, family };
  signal?.throwIfAborted();
  let answers: Address[];
  try { answers = await resolve(hostname); }
  catch (error) { if ((error as NodeJS.ErrnoException)?.code === "ENOTFOUND") throw new DnsError(); else throw error; }
  signal?.throwIfAborted();
  if (!answers.length) throw new DnsError();
  if (answers.some(({ address, family }) => family !== isIP(address) || !isPublicAddress(address))) throw new BlockedHostError();
  return answers.find((answer) => answer.family === 4) ?? answers[0];
}

/** This lookup never resolves again: the socket receives only the verified address. */
export function pinnedLookup(url: URL, pin: Address): LookupFunction {
  return (hostname, options, callback) => {
    if (hostnameOf(url) !== hostname.toLowerCase().replace(/\.$/, "")) {
      callback(new BlockedHostError(), "", 0);
      return;
    }
    if (options.all) callback(null, [pin]);
    else callback(null, pin.address, pin.family);
  };
}

export type SafeResponse = { status: number; location: string | null; body: string; contentType?: string; contentEncoding?: string; bytes?: Buffer; truncated?: boolean };
export class ResponseTooLargeError extends Error {}
export class RequestDeadlineError extends Error {}
export type SafeRequest = (url: URL, options: {
  method: "HEAD" | "GET" | "POST";
  signal: AbortSignal;
  headers?: Record<string, string>;
  body?: string;
  maxBytes?: number;
  pageContentOnly?: boolean;
  /** Only for extraction, never for model/API or file responses. */
  allowPrefix?: boolean;
  rawBytes?: boolean;
  acceptContent?: (contentType?: string, contentEncoding?: string) => boolean;
}) => Promise<SafeResponse>;

export function isPageText(contentType?: string, contentEncoding?: string) {
  const mime = contentType?.split(";")[0]?.trim().toLowerCase();
  return (!contentEncoding || contentEncoding.trim().toLowerCase() === "identity") &&
    (mime === "text/html" || mime === "application/xhtml+xml" || mime === "text/plain");
}

/** Direct Node socket (no proxy, redirect or reusable agent), with hostname-bound TLS. */
export const requestPinned: SafeRequest = async (url, options) => {
  const pin = await pinAddress(url, resolveSystem, options.signal);
  const send = url.protocol === "https:" ? httpsRequest : httpRequest;
  const conn: RequestOptions = {
    method: options.method,
    agent: false,
    signal: options.signal,
    lookup: pinnedLookup(url, pin),
    family: pin.family,
    headers: options.headers,
  };
  if (url.protocol === "https:") Object.assign(conn, {
    rejectUnauthorized: true,
    ...(isIP(hostnameOf(url)) ? {} : { servername: hostnameOf(url) }),
  });
  return new Promise((resolve, reject) => {
    const req = send(url, conn, (res) => {
      const info = {
        status: res.statusCode ?? 0,
        location: res.headers.location ?? null,
        contentType: res.headers["content-type"],
        contentEncoding: res.headers["content-encoding"],
      };
      if (!options.maxBytes || info.status < 200 || info.status >= 300 ||
          (options.pageContentOnly && !isPageText(info.contentType, info.contentEncoding)) ||
          (options.acceptContent && !options.acceptContent(info.contentType, info.contentEncoding))) {
        resolve({ ...info, body: "" });
        res.destroy();
        return;
      }
      const chunks: Buffer[] = [];
      let bytes = 0;
      function finish(truncated: boolean) {
        const body = Buffer.concat(chunks, bytes);
        resolve({ ...info, truncated, body: options.rawBytes ? "" : body.toString("utf8"), ...(options.rawBytes && { bytes: body }) });
      }
      res.on("data", (chunk: Buffer) => {
        const left = options.maxBytes! - bytes;
        if (chunk.length > left) {
          if (!options.allowPrefix) { res.destroy(new ResponseTooLargeError()); return; }
          if (left > 0) { chunks.push(chunk.subarray(0, left)); bytes += left; }
          finish(true);
          res.destroy();
          return;
        }
        chunks.push(chunk);
        bytes += chunk.length;
      });
      res.once("error", reject);
      res.once("aborted", () => reject(new Error("Response aborted")));
      res.once("end", () => finish(info.status === 206));
    });
    req.once("error", reject);
    req.end(options.body);
  });
};

/** Bound visual action latency including DNS, which Node's system resolver cannot abort. */
export async function withinDeadline<T>(ms: number, task: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([task(controller.signal), new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new RequestDeadlineError("Request timeout"));
        controller.abort();
      }, ms);
    })]);
  } finally { clearTimeout(timer); }
}

/** Transport adapter for the existing links/check strategy. No cookies or keys. */
export function linkTransport(send: SafeRequest = requestPinned, overall?: AbortSignal) {
  return (raw: string, method: "HEAD" | "GET") => withinDeadline(7000, (perHop) => {
    const signal = overall ? AbortSignal.any([perHop, overall]) : perHop;
    signal.throwIfAborted();
    return send(safeUrl(raw), {
      signal, method, headers: { "user-agent": "iliang-nav/1.0", ...(method === "GET" ? { range: "bytes=0-0" } : {}) },
    });
  });
}

export function providerEndpoint(raw: string): URL {
  const url = safeUrl(raw.trim(), true);
  if (url.search || url.hash) throw new BlockedHostError("API 地址不能含有查询参数或片段");
  const base = url.pathname.replace(/\/+$/, "");
  url.pathname = base.endsWith("/chat/completions") ? base : `${base}/chat/completions`;
  return url;
}
