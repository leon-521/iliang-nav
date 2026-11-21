/**
 * 书签图标：有 iconUrl 就显示图片，否则用首字母块。
 * 与后台表格保持同一套回退逻辑，避免两处观感不一致。
 */
export function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/**
 * 显示用标题。
 *
 * 有些书签的 title 本身就是 URL（导入时站点没有 <title>，或手动只贴了链接），
 * 直接渲染会得到「https://www.baidu.c…」这种被截断的垃圾。
 * 标题看起来是网址时，退回用域名展示 —— 只改显示，不动数据。
 */
export function displayTitle(title: string, url: string): string {
  const t = title.trim();
  if (!t) return hostOf(url) || url;

  const looksLikeUrl = /^https?:\/\//i.test(t) || /^www\./i.test(t);
  if (!looksLikeUrl) return t;

  const host = hostOf(t.startsWith("http") ? t : `https://${t}`);
  return host || t;
}

export function Favicon({
  title,
  url,
  iconUrl,
  iconHidden,
  size = 20,
  className = "",
}: {
  title: string;
  url: string;
  iconUrl?: string | null;
  iconHidden?: boolean;
  size?: number;
  className?: string;
}) {
  const show = iconUrl && !iconHidden;

  if (!show) {
    const letter = (title || hostOf(url) || "?")
      .trim()
      .charAt(0)
      .toUpperCase();
    return (
      <span
        aria-hidden
        className={`flex shrink-0 items-center justify-center rounded-md bg-secondary font-semibold text-muted-foreground ring-1 ring-border ${className}`}
        style={{ width: size, height: size, fontSize: Math.round(size * 0.46) }}
      >
        {letter}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={iconUrl!}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      className={`shrink-0 rounded-md object-contain ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
