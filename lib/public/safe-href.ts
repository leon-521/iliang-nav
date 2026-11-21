/**
 * 链接出口校验。
 *
 * 为什么需要这一层：`lib/import/url.ts` 只在**导入那一刻**限了
 * http/https，书签也可以从后台表单直接创建、或者直接改库。防御在入口、
 * 不在出口，意味着库里一旦存在 `javascript:alert(1)`，前台 `<a href>`
 * 就是一个可点的 XSS。
 *
 * 所以渲染处统一过这道关：只放行 http/https（以及可选的 mailto），
 * 其他一律降级成 `#`。不改 normalizeUrl —— 那是入库校验，职责不同，
 * 混在一起会让「历史脏数据」和「新输入」用同一套规则，反而难查。
 */

/** 允许出现在前台 href 里的协议 */
const ALLOWED = new Set(["http:", "https:", "mailto:", "tel:"]);

/**
 * 返回可安全放进 href 的地址。
 * 非法或不允许的协议一律返回 "#"，不抛错 —— 渲染层不该因为一条脏数据炸掉整页。
 */
export function safeHref(url: string | null | undefined): string {
  if (!url) return "#";
  const trimmed = url.trim();
  if (!trimmed) return "#";

  /*
   * 站内相对路径直接放行。
   * 必须排除 `//evil.com` —— 它会被浏览器当成协议相对 URL，
   * 也就是跳到外站。所以只认单斜杠开头。
   */
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return trimmed;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    /*
     * 解析失败有两种情况：一是完全没有协议（`example.com`），
     * 二是协议写法畸形。前者补 https 后通常能过，后者直接拒绝。
     */
    try {
      parsed = new URL(`https://${trimmed}`);
    } catch {
      return "#";
    }
  }

  return ALLOWED.has(parsed.protocol) ? parsed.toString() : "#";
}

/** 是否是一个能安全跳转的地址（给需要判断的地方用，比如「禁用外链按钮」） */
export function isSafeHref(url: string | null | undefined): boolean {
  return safeHref(url) !== "#";
}
