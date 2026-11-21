/**
 * URL 规范化：用于去重与生成 url_hash
 *
 * 规则（写进文档，避免以后扯皮）：
 *  1. scheme + host 小写
 *  2. 去默认端口 (:80 / :443)
 *  3. 去追踪参数 utm_* / fbclid / gclid / msclkid
 *  4. 根路径的末尾 / 统一去掉；其他路径保留
 *  5. fragment：路由型（#/a）保留，普通锚点（#section）丢弃
 *  6. 查询参数按键名排序（顺序不影响语义）
 *
 * fragment 单独处理的原因：SPA 用 hash 路由，`/#/a` 与 `/#/b` 是两个不同页面。
 * 早先无条件剥掉 fragment，两者会存成同一个地址并被误判重复。
 */

const TRACKING = [
  /^utm_/i,
  /^fbclid$/i,
  /^gclid$/i,
  /^msclkid$/i,
  /^yclid$/i,
  /^_ga$/i,
  /^ref_src$/i,
];

export function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    // 没有 scheme 的尝试补 https
    try {
      u = new URL(`https://${trimmed}`);
    } catch {
      return null;
    }
  }

  if (u.protocol !== "http:" && u.protocol !== "https:") return null;

  const host = u.hostname.toLowerCase();
  const isDefaultPort =
    (u.protocol === "http:" && u.port === "80") ||
    (u.protocol === "https:" && u.port === "443");
  const port = isDefaultPort ? "" : u.port ? `:${u.port}` : "";

  // 过滤追踪参数并排序
  const params = [...u.searchParams.entries()]
    .filter(([k]) => !TRACKING.some((re) => re.test(k)))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  const search = params.length
    ? `?${params.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&")}`
    : "";

  let pathname = u.pathname;
  if (pathname === "/") pathname = "";
  // 非根路径保留末尾斜杠（有些站点 /a 和 /a/ 内容不同）

  // 保留有路由含义的 fragment；纯锚点交给 dedupeKey 丢弃
  const fragment = u.hash && u.hash !== "#" ? u.hash : "";

  return `${u.protocol}//${host}${port}${pathname}${search}${fragment}`;
}

/**
 * 去重键：从规范化地址里抽出「参与去重」的部分。
 * 路由型 fragment（以 / 开头）算地址的一部分，普通锚点不算。
 */
export function dedupeKey(normalized: string): string {
  const i = normalized.indexOf("#");
  if (i === -1) return normalized;
  const frag = normalized.slice(i + 1);
  return frag.startsWith("/") ? normalized : normalized.slice(0, i);
}

/** 稳定 hash：用 FNV-1a 64bit 的十六进制，足够做去重键 */
export function hashUrl(normalized: string): string {
  const key = dedupeKey(normalized);
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < key.length; i++) {
    const c = key.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x85ebca6b) >>> 0;
  }
  return (
    h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0")
  );
}

export function urlHash(raw: string): string | null {
  const n = normalizeUrl(raw);
  return n ? hashUrl(n) : null;
}
