import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { isPublicAddress, pinnedLookup, withinDeadline, type Resolver } from "../ai/network";
import { collectionUrl, type WebDavConfig, WebDavError } from "./config";

type Target = { address: string; family: number };
const looksLocal = (host: string) => !host.includes(".") || /(?:^|\.)(localhost|local|internal|lan|home|onion|arpa|test|invalid|example)$/.test(host);
const hostOf = (url: URL) => url.hostname.replace(/^\[|\]$|\.$/g, "");

function isNasAddress(ip: string): boolean {
  if (isIP(ip) === 6) return /^f[cd][0-9a-f]{2}:/i.test(ip);
  if (isIP(ip) !== 4) return false;
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

/** Private NAS targets need an exact operator-configured origin and exact destination IP. */
function allowedNasIp(url: URL, allowlist: string) {
  for (const token of allowlist.split(",")) {
    const [origin, rawIp, extra] = token.trim().split("=");
    if (!origin || !rawIp || extra !== undefined) continue;
    const ip = rawIp.trim().toLowerCase();
    if (origin.trim() === url.origin && isNasAddress(ip)) return ip;
  }
}

function canonicalIp(address: string) {
  return isIP(address) === 6 ? new URL(`https://[${address}]/`).hostname.slice(1, -1) : address;
}

export function validateOrigin(url: URL, allowlist = process.env.WEBDAV_PRIVATE_TARGETS ?? "") {
  const hostname = hostOf(url);
  const nasIp = allowedNasIp(url, allowlist);
  const isPublic = isIP(hostname) ? isPublicAddress(hostname) && hostname !== "168.63.129.16" : !looksLocal(hostname);
  if ((!isPublic || url.port) && !nasIp) throw new WebDavError("只允许公开 HTTPS 地址；内网 NAS 必须由服务器运营者显式配置允许列表。");
  return nasIp;
}

export async function selectAddress(url: URL, signal: AbortSignal, resolve: Resolver = (host) => lookup(host, { all: true }), allowlist = process.env.WEBDAV_PRIVATE_TARGETS ?? ""): Promise<Target> {
  const hostname = hostOf(url);
  const nasIp = validateOrigin(url, allowlist);
  const literal = isIP(hostname);
  signal.throwIfAborted();
  const addresses = literal ? [{ address: hostname, family: literal }] : await resolve(hostname);
  signal.throwIfAborted();
  if (!addresses.length || addresses.some(({ address, family }) => (family !== 4 && family !== 6) || isIP(address) !== family ||
      (nasIp ? canonicalIp(address) !== canonicalIp(nasIp) : !isPublicAddress(address) || address === "168.63.129.16"))) {
    throw new WebDavError("WebDAV 地址解析到未授权网络，已阻止上传。");
  }
  return addresses.find((entry) => entry.family === 4) ?? addresses[0];
}

export function uploadUrl(endpoint: string, filename: string) {
  if (!/^app-\d{8}-\d{6}(?:-[a-z0-9]{1,12})?\.db$/.test(filename)) throw new WebDavError("本地备份名称不合法。");
  return new URL(filename, collectionUrl(endpoint));
}

function verifyStatus(status: number) {
  if (status === 200 || status === 201 || status === 204) return;
  if (status >= 300 && status < 400) throw new WebDavError("WebDAV 返回重定向，已阻止；请填写服务器上的最终文件夹地址。");
  if (status === 401 || status === 403) throw new WebDavError(`WebDAV 拒绝写入（HTTP ${status}），请检查账号及目录权限。`);
  if (status === 404 || status === 409) throw new WebDavError(`WebDAV 找不到目标目录（HTTP ${status}），请先在服务端创建。`);
  throw new WebDavError(`WebDAV 未确认收到备份（HTTP ${status}）。`);
}

/** Send one authenticated, TLS-verified conditional PUT without following redirects. */
export async function uploadSnapshot(config: Pick<WebDavConfig, "endpoint" | "username" | "password">, name: string, file: string) {
  const url = uploadUrl(config.endpoint, name);
  const bytes = (await stat(file)).size;
  await withinDeadline(120_000, async (signal) => {
    const pin = await selectAddress(url, signal);
    const hostname = hostOf(url);
    let req: ReturnType<typeof request> | undefined;
    try {
      const status = new Promise<number>((resolve, reject) => {
        req = request(url, {
          method: "PUT",
          headers: {
            authorization: `Basic ${Buffer.from(`${config.username}:${config.password}`, "utf8").toString("base64")}`,
            "content-type": "application/vnd.sqlite3",
            "content-length": bytes,
            "if-none-match": "*",
          },
          lookup: pinnedLookup(url, pin),
          family: pin.family,
          agent: false,
          signal,
          minVersion: "TLSv1.2",
          rejectUnauthorized: true,
          ...(isIP(hostname) ? {} : { servername: hostname }),
        }, (response) => {
          resolve(response.statusCode ?? 0);
          // No response content is trusted, saved, or returned to the administrator.
          response.destroy();
        });
        req.once("error", reject);
      });
      if (!req) { await status; return; }
      await Promise.all([status.then(verifyStatus), pipeline(createReadStream(file), req, { signal })]);
    } finally {
      req?.destroy();
    }
  });
}
