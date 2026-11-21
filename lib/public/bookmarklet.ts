"use client";

import * as React from "react";

/**
 * 生成「一键收藏」书签脚本。
 *
 * 书签脚本要在任意网站上执行，所以目标地址必须是绝对地址。
 * 单行、无换行 —— 书签地址里换行会被浏览器截断。
 * 用 encodeURIComponent 转义，避免 & # 这类字符把参数截断。
 */
export function buildBookmarkletCode(origin: string) {
  if (!origin) return "";
  /*
   * 前后台合并后只有 /quick-add 这一个地址。
   * 这个页面要写库，未登录时服务端会把它转到 /login 并带上回跳参数。
   */
  const target = `${origin.replace(/\/$/, "")}/quick-add`;
  return (
    "javascript:(function(){var u=encodeURIComponent(location.href)," +
    "t=encodeURIComponent(document.title);" +
    `window.open('${target}?url='+u+'&title='+t,'_blank',` +
    "'width=560,height=720');})()"
  );
}

/**
 * 取当前站点地址并生成脚本。
 *
 * 服务端给的是 PUBLIC_BASE_URL；本地开发时那个值可能没配，
 * 就在客户端退回当前 origin —— 这个 hook 只在浏览器里跑。
 */
export function useBookmarklet(baseUrl?: string) {
  const [origin, setOrigin] = React.useState(baseUrl ?? "");

  React.useEffect(() => {
    if (!origin) setOrigin(window.location.origin);
  }, [origin]);

  return React.useMemo(() => buildBookmarkletCode(origin), [origin]);
}
