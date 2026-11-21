import { normalizeUrl } from "@/lib/import/url";
import { assertPublicHost, BlockedHostError, DnsError } from "@/lib/net/guard";

/**
 * 链接健康检测。
 *
 * 判定原则（宁可漏报，不要误报）：
 *  - 4xx 里的 404 / 410 是「页面真的没了」，才算失效
 *  - 401 / 403 / 429 不算失效 —— 是权限或限流，链接本身还在
 *  - 5xx 不算失效 —— 服务器临时抽风，过会儿可能就好
 *  - DNS 解析失败 / 连接被拒 / 超时，重试一次仍失败才算失效
 *
 * 为什么不直接 HEAD：不少站点对 HEAD 返回 405 或 403，
 * 但对 GET 正常。HEAD 失败时降级成带 Range 的 GET，只取 1 字节。
 */

const TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 4;
const UA =
  "Mozilla/5.0 (compatible; iliang-nav/1.0) AppleWebKit/537.36";

export type CheckReason =
  | "ok"
  | "not_found"
  | "auth_required"
  | "rate_limited"
  | "server_error"
  | "unreachable"
  | "network_error"
  | "timeout"
  | "blocked";

export type CheckResult = {
  /** true 表示「没坏」，包括 403/429/5xx 与「本站网络到不了」 */
  ok: boolean;
  status: number | null;
  reason: CheckReason;
  detail: string;
  finalUrl: string | null;
};

/**
 * 取出 fetch 失败的底层 errno。
 *
 * undici 把真实错误包在 .cause 里，只看 e.message 永远是 "fetch failed"，
 * 分不清「域名不存在」和「我们连不上」——这两件事的结论完全不同。
 */
function errnoOf(e: unknown): string | null {
  const cause = (e as { cause?: { code?: unknown } })?.cause;
  const code = cause?.code ?? (e as { code?: unknown })?.code;
  return typeof code === "string" ? code : null;
}

/** 这些错误说明「本机到不了目标」，不代表对方站点没了 */
const UNREACHABLE = new Set([
  "ETIMEDOUT",
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EPIPE",
  "EAI_AGAIN",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
]);

/** 只有域名真的不存在（NXDOMAIN）才判失效 */
const DOMAIN_GONE = new Set(["ENOTFOUND"]);

async function guard(hostname: string) {
  await assertPublicHost(hostname);
}

/** The supplied transport must enforce its own network safety on every request. */
export type CheckTransport = (
  url: string,
  method: "HEAD" | "GET",
) => Promise<{ status: number; location: string | null }>;

const request: CheckTransport = async (url, method) => {
  await guard(new URL(url).hostname);
  const res = await fetch(url, {
    method,
    redirect: "manual",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      "user-agent": UA,
      accept: "text/html,application/xhtml+xml,*/*;q=0.8",
      ...(method === "GET" ? { range: "bytes=0-0" } : {}),
    },
  });
  return { status: res.status, location: res.headers.get("location") };
};

/** 手动跟跳转，每一跳都做内网检查 */
async function follow(
  startUrl: string,
  method: "HEAD" | "GET",
  transport: CheckTransport,
): Promise<{ status: number; finalUrl: string }> {
  let current = startUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const { status, location } = await transport(current, method);

    if (status >= 300 && status < 400 && location) {
      current = new URL(location, current).toString();
      continue;
    }
    return { status, finalUrl: current };
  }

  // 跳转打转：当成不可用，但不算「404」
  return { status: 310, finalUrl: current };
}

/** 导出来是为了能单测判定策略，不用真去请求 403/429 的站点 */
export function classifyStatus(status: number): {
  ok: boolean;
  reason: CheckReason;
  detail: string;
} {
  if (status >= 200 && status < 300) return { ok: true, reason: "ok", detail: `HTTP ${status}` };
  if (status === 404 || status === 410)
    return { ok: false, reason: "not_found", detail: `HTTP ${status}` };
  if (status === 401 || status === 403)
    return { ok: true, reason: "auth_required", detail: `HTTP ${status}` };
  if (status === 429) return { ok: true, reason: "rate_limited", detail: "HTTP 429" };
  if (status >= 500)
    return { ok: true, reason: "server_error", detail: `HTTP ${status}` };
  if (status >= 400)
    return { ok: false, reason: "not_found", detail: `HTTP ${status}` };
  return { ok: true, reason: "ok", detail: `HTTP ${status}` };
}

async function attempt(url: string, transport: CheckTransport, confirmNotFound: boolean): Promise<CheckResult> {
  try {
    let r = await follow(url, "HEAD", transport);

    // HEAD 被拒或不支持时，用 GET 再试一次
    if ([405, 501, 403, 400].includes(r.status) || (confirmNotFound && [404, 410].includes(r.status))) {
      r = await follow(url, "GET", transport);
    }

    const c = classifyStatus(r.status);
    return { ...c, status: r.status, finalUrl: r.finalUrl };
  } catch (e) {
    // 域名不存在：这是「链接真的没了」，必须判失效
    if (e instanceof DnsError) {
      return { ok: false, status: null, reason: "not_found", detail: "域名不存在", finalUrl: null };
    }
    if (e instanceof BlockedHostError) {
      return { ok: true, status: null, reason: "blocked", detail: "内网地址，跳过检测", finalUrl: null };
    }

    const errno = errnoOf(e);

    /*
     * 关键区分：
     *  - ENOTFOUND      → 域名不存在，链接确实失效
     *  - ETIMEDOUT 等   → 这台机器网络到不了（比如国内访问 Google），
     *                     链接本身可能好好的，绝不能标记为失效
     */
    if (errno && DOMAIN_GONE.has(errno)) {
      return { ok: false, status: null, reason: "not_found", detail: "域名不存在", finalUrl: null };
    }
    if (errno && UNREACHABLE.has(errno)) {
      return {
        ok: true,
        status: null,
        reason: "unreachable",
        detail: `本机网络不可达（${errno}），未判定为失效`,
        finalUrl: null,
      };
    }
    if (e instanceof Error && e.name === "TimeoutError") {
      return {
        ok: true,
        status: null,
        reason: "unreachable",
        detail: "请求超时，未判定为失效",
        finalUrl: null,
      };
    }

    return {
      ok: true,
      status: null,
      reason: "unreachable",
      detail: (errno ? `${errno} ` : "") + (e instanceof Error ? e.message.slice(0, 100) : "网络错误"),
      finalUrl: null,
    };
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function checkUrl(rawUrl: string, transport: CheckTransport = request, confirmNotFound = false): Promise<CheckResult> {
  const normalized = normalizeUrl(rawUrl);
  if (!normalized) {
    return { ok: false, status: null, reason: "network_error", detail: "地址不合法", finalUrl: null };
  }

  let result = await attempt(normalized, transport, confirmNotFound);

  // 不可达时重试一次：单次抖动不该影响结论
  if (result.reason === "unreachable") {
    await sleep(1200);
    result = await attempt(normalized, transport, confirmNotFound);
  }

  return result;
}
