import dns from "node:dns/promises";
import net from "node:net";

/**
 * 内网地址防护。
 *
 * 元信息抓取和链接检测都会让服务器去请求用户给的地址，
 * 两处都必须过这道关 —— 否则「添加书签」等于内网探测工具。
 * 放独立模块是为了只有一份实现，不会改了一处忘了另一处。
 */

/** 私有 / 回环 / 链路本地 / 组播等不该被访问的网段 */
export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local / 云元数据 169.254.169.254
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // 组播 / 保留
    return false;
  }

  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v === "::1" || v === "::") return true;
    if (v.startsWith("fe80")) return true; // link-local
    if (v.startsWith("fc") || v.startsWith("fd")) return true; // ULA
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return false;
  }

  return true; // 解析不出来就当危险
}

export class BlockedHostError extends Error {
  constructor(message = "不允许访问内网地址") {
    super(message);
    this.name = "BlockedHostError";
  }
}

/**
 * DNS 解析失败。
 *
 * 必须和 BlockedHostError 分开：
 *  - BlockedHostError → 我们主动拒绝（内网地址），结论是「跳过检测」
 *  - DnsError         → 域名根本不存在，结论是「链接失效」
 * 混在一起会把已经死掉的域名当成「无法判定」永远留在库里。
 */
export class DnsError extends Error {
  constructor(message = "域名解析失败") {
    super(message);
    this.name = "DnsError";
  }
}

/** 域名先解析成 IP 再判断，不能只看字符串 */
export async function assertPublicHost(hostname: string): Promise<void> {
  const lower = hostname.toLowerCase();

  if (
    lower === "localhost" ||
    lower.endsWith(".localhost") ||
    lower.endsWith(".local") ||
    lower.endsWith(".internal")
  ) {
    throw new BlockedHostError();
  }

  if (net.isIP(lower)) {
    if (isPrivateAddress(lower)) throw new BlockedHostError();
    return;
  }

  let addrs: { address: string }[];
  try {
    addrs = await dns.lookup(lower, { all: true });
  } catch (e) {
    // EAI_AGAIN 是 DNS 服务临时抽风，不能当成域名不存在
    const code = (e as { code?: string })?.code;
    if (code === "EAI_AGAIN") throw new BlockedHostError("DNS 暂时不可用");
    throw new DnsError();
  }

  if (addrs.length === 0) throw new DnsError();
  if (addrs.some((a) => isPrivateAddress(a.address))) throw new BlockedHostError();
}
