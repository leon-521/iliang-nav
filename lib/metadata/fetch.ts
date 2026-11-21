import * as cheerio from "cheerio";
import { normalizeUrl } from "@/lib/import/url";
import { assertPublicHost } from "@/lib/net/guard";

/**
 * 抓取网页元信息（标题 / 描述 / 图标）。
 *
 * 三个必须守住的点：
 *  1. **SSRF**：这个函数会让服务器去请求任意 URL。虽然只有管理员能触发，
 *     但服务端跑在 VPS 上，管理服务与应用自身都可能监听在本机，
 *     不拦的话「添加书签」就成了内网探测工具。所以域名先解析成 IP，
 *     再逐个判断是否落在私有段。第三方图标服务同样要过这道关。
 *  2. **体积**：不读完整个 body。只读前 512KB 就够拿到 <head>，
 *     遇到几百 MB 的文件也不会把内存吃爆。
 *  3. **字符集**：中文站点大量是 GBK，按 UTF-8 硬解会得到乱码标题。
 *     先看响应头 charset，再看 <meta charset>，最后才退回 UTF-8。
 *
 * 图标和简介的兜底顺序来自 docs/metadata-research.md 的实测（30 站图标、
 * 51 页简介）。关键结论：只看 HTTP 状态和 content-type 会被骗 ——
 * favicon.im 未命中返 200 + 257B 灰底斜体 f，必须查真实字节。
 */

const MAX_BYTES = 512 * 1024;
const TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 3;

/** 图标探测超时。实测 36kr 的 favicon.ico 只要 879B 却要 3~7s，不能设太短 */
const ICON_TIMEOUT_MS = 6000;
/** 第三方图标服务超时。favicon.im 对部分站点会卡到 15s，必须压住 */
const THIRD_PARTY_TIMEOUT_MS = 4000;

/** 图标最小字节数。pnpm.io 的真图标只有 241B，阈值不能高于 200 */
const MIN_ICON_BYTES = 200;
/** 低于 96px 视为「有但很糊」，排在后面 */
const MIN_SHARP_PX = 96;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** 图标请求的 Accept。不带 avif：cal.com 的 apple-touch-icon 返回 avif，校验会误判 */
const ICON_ACCEPT = "image/png,image/x-icon,image/svg+xml,image/webp,image/*;q=0.8";

export type PageMetadata = {
  title: string | null;
  description: string | null;
  iconUrl: string | null;
  finalUrl: string;
};

export class MetadataError extends Error {}

/** 把共享防护模块的错误统一成 MetadataError，前端只处理一种错误 */
async function guardHost(hostname: string): Promise<void> {
  try {
    await assertPublicHost(hostname);
  } catch (e) {
    throw new MetadataError(e instanceof Error ? e.message : "不允许访问内网地址");
  }
}

/** 从 Content-Type 或 HTML 头部猜字符集 */
function sniffCharset(contentType: string | null, head: Buffer): string {
  const fromHeader = contentType?.match(/charset=["']?([\w-]+)/i)?.[1];
  if (fromHeader) return fromHeader;

  // <meta charset="gbk"> / <meta http-equiv=... content="text/html; charset=gbk">
  const ascii = head.subarray(0, 4096).toString("latin1");
  const meta =
    ascii.match(/<meta[^>]+charset=["']?\s*([\w-]+)/i)?.[1] ??
    ascii.match(/content=["'][^"']*charset=\s*([\w-]+)/i)?.[1];
  if (meta) return meta;

  return "utf-8";
}

function decode(buffer: Buffer, charset: string): string {
  try {
    return new TextDecoder(charset).decode(buffer);
  } catch {
    return new TextDecoder("utf-8").decode(buffer);
  }
}

/** 手动跟随重定向，每一跳都重新做内网检查 */
async function safeFetch(startUrl: string): Promise<{
  res: Response;
  finalUrl: string;
  body: Buffer;
}> {
  let current = startUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const u = new URL(current);
    await guardHost(u.hostname);

    const res = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        "user-agent": UA,
        accept: "text/html,application/xhtml+xml",
        "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
      },
    });

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new MetadataError("重定向缺少目标地址");
      current = new URL(loc, current).toString();
      continue;
    }

    const type = res.headers.get("content-type") ?? "";
    if (type && !/text\/html|application\/xhtml/i.test(type)) {
      throw new MetadataError(`不是网页（${type.split(";")[0]}）`);
    }

    // 只读前 MAX_BYTES
    const reader = res.body?.getReader();
    const chunks: Buffer[] = [];
    let size = 0;
    if (reader) {
      while (size < MAX_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(Buffer.from(value));
        size += value.byteLength;
      }
      await reader.cancel().catch(() => {});
    }
    const body = Buffer.concat(chunks).subarray(0, MAX_BYTES);

    return { res, finalUrl: current, body };
  }

  throw new MetadataError("重定向次数过多");
}

function absolutize(href: string, base: string): string | null {
  try {
    const u = new URL(href, base);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

/* ------------------------------ 图标 ------------------------------ */

/**
 * data: URI 直接跳过，不要丢给 absolutize。
 * 掘金、36kr 都写了 `<link rel=icon href="data:;base64,=">`，
 * absolutize 会返回 null 并把真实原因盖掉，最后只能退到 /favicon.ico，
 * 而掘金那个 favicon.ico 返回的是 HTML —— 结果就是彻底没有图标。
 */
function isDataUri(href: string): boolean {
  return /^\s*data:/i.test(href);
}

/** `sizes="48x48"` → 48；`sizes="any"`（SVG）给 512；多值取最大 */
function parseSizes(sizes: string | undefined): number | null {
  if (!sizes) return null;
  if (/^\s*any\s*$/i.test(sizes)) return 512;

  const all = [...sizes.matchAll(/(\d+)\s*[x×]\s*(\d+)/gi)].map((m) =>
    Math.max(Number(m[1]), Number(m[2])),
  );
  if (all.length) return Math.max(...all);

  const single = sizes.match(/(\d+)/);
  return single ? Number(single[1]) : null;
}

type ImageKind = "png" | "ico" | "jpeg" | "gif" | "webp" | "svg" | "html" | "other";

/** 读真实字节判断格式，不信 content-type（36kr 声明 ico 实际是 PNG） */
function sniffImage(buf: Buffer): ImageKind {
  if (buf.length >= 8 && buf.readUInt32BE(0) === 0x89504e47) return "png";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf.length >= 4 && buf.subarray(0, 4).toString("latin1") === "GIF8") return "gif";
  if (buf.length >= 12 && buf.subarray(0, 4).toString("latin1") === "RIFF") {
    if (buf.subarray(8, 12).toString("latin1") === "WEBP") return "webp";
  }
  if (buf.length >= 4 && buf[0] === 0x00 && buf[1] === 0x00 && buf[2] === 0x01 && buf[3] === 0x00) {
    return "ico";
  }

  const head = buf.subarray(0, 512).toString("utf8").trimStart();
  if (/^<\?xml/i.test(head) && /<svg/i.test(head)) return "svg";
  if (/^<svg/i.test(head)) return "svg";
  if (/^<(!doctype\s+html|html)/i.test(head)) return "html";

  return "other";
}

/**
 * 占位图指纹。
 * favicon.im 未命中时返回 200 + 257B 的 SVG：灰底圆 + 斜体 f。
 * 不认这个指纹的话，每个抓不到图标的站都会被存上一张灰 f。
 */
function isPlaceholderSvg(buf: Buffer): boolean {
  const text = buf.subarray(0, 2048).toString("utf8");
  if (/fill=["']#808080["']/i.test(text) && /<text/i.test(text)) return true;
  // unavatar 未命中时返回自家 logo
  if (/<title>\s*unavatar\s*<\/title>/i.test(text)) return true;
  return false;
}

/**
 * 判定「这是一张真图标」：状态码 → content-type → 真实字节 → 占位图指纹。
 * 少任何一道都会存下假图。
 */
async function isRealImage(
  url: string,
  opts: { minBytes?: number; timeoutMs?: number } = {},
): Promise<boolean> {
  try {
    const u = new URL(url);
    await guardHost(u.hostname);

    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(opts.timeoutMs ?? ICON_TIMEOUT_MS),
      headers: { "user-agent": UA, accept: ICON_ACCEPT },
    });
    // google-s2 / ddg 未命中都是 404，这一关就挡住了
    if (!res.ok) return false;

    const ct = (res.headers.get("content-type") ?? "").toLowerCase();
    if (!ct.startsWith("image/")) return false;

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < (opts.minBytes ?? MIN_ICON_BYTES)) return false;

    const kind = sniffImage(buf);
    // 200 + HTML 错误页（掘金的 /favicon.ico 就是这样）
    if (kind === "html") return false;
    if (kind === "svg" && isPlaceholderSvg(buf)) return false;
    return true;
  } catch {
    return false;
  }
}

type IconCandidate = {
  url: string;
  px: number;
  svg?: boolean;
  mask?: boolean;
  from: "apple" | "manifest" | "icon" | "ms" | "favicon";
};

/**
 * 相对路径要试两个基址。
 * dbarobin.com 的 `href="favicon/x.png"` 按文档 URL 解析会落到
 * `…/2024/11/25/favicon/x.png`（返回 HTML），按站点根解析才是真 PNG。
 */
function expandHref(href: string, finalUrl: string): string[] {
  const out: string[] = [];
  const first = absolutize(href, finalUrl);
  if (first) out.push(first);

  const isRelative = !/^(https?:)?\/\//i.test(href) && !href.startsWith("/");
  if (isRelative) {
    const root = absolutize(`/${href}`, finalUrl);
    if (root && !out.includes(root)) out.push(root);
  }
  return out;
}

/** 拉 webmanifest 的 icons。github 的 512px 只在这里 */
async function fetchManifestIcons(
  manifestUrl: string,
): Promise<Array<{ url: string; px: number }>> {
  try {
    const u = new URL(manifestUrl);
    await guardHost(u.hostname);

    const res = await fetch(manifestUrl, {
      redirect: "follow",
      signal: AbortSignal.timeout(4000),
      headers: { "user-agent": UA, accept: "application/manifest+json,application/json,*/*" },
    });
    if (!res.ok) return [];

    const text = await res.text();
    const json = JSON.parse(text) as {
      icons?: Array<{ src?: string; sizes?: string; purpose?: string }>;
    };
    if (!Array.isArray(json.icons)) return [];

    const out: Array<{ url: string; px: number }> = [];
    for (const icon of json.icons) {
      const src = icon.src;
      if (!src || isDataUri(src)) continue;
      // 单色剪影当彩色 logo 用会变成一坨黑
      if (/monochrome/i.test(icon.purpose ?? "")) continue;

      const px = parseSizes(icon.sizes) ?? 0;
      if (px < MIN_SHARP_PX) continue;

      const abs = absolutize(src, manifestUrl);
      if (abs) out.push({ url: abs, px });
    }
    return out;
  } catch {
    return [];
  }
}

/** 收集候选并排序：清晰的在前，单色剪影永远垫底 */
async function collectIconCandidates(
  $: cheerio.CheerioAPI,
  finalUrl: string,
): Promise<IconCandidate[]> {
  const cands: IconCandidate[] = [];

  // ① apple-touch-icon（含 -precomposed），按 sizes 降序
  $('link[rel*="apple-touch-icon"]').each((_, el) => {
    const href = $(el).attr("href");
    if (!href || isDataUri(href)) return;
    const px = parseSizes($(el).attr("sizes")) ?? 180;
    for (const url of expandHref(href, finalUrl)) {
      cands.push({ url, px, from: "apple" });
    }
  });

  // ② webmanifest：多一次请求，失败静默
  const manifestHref = $('link[rel="manifest"]').attr("href");
  if (manifestHref && !isDataUri(manifestHref)) {
    const manifestUrl = absolutize(manifestHref, finalUrl);
    if (manifestUrl) {
      for (const icon of await fetchManifestIcons(manifestUrl)) {
        cands.push({ url: icon.url, px: icon.px, from: "manifest" });
      }
    }
  }

  // ③④⑥ rel=icon / shortcut icon / mask-icon
  $('link[rel~="icon"], link[rel="shortcut icon"], link[rel="mask-icon"]').each((_, el) => {
    const href = $(el).attr("href");
    if (!href || isDataUri(href)) return;

    const rel = ($(el).attr("rel") ?? "").toLowerCase();
    const type = ($(el).attr("type") ?? "").toLowerCase();
    const isMask =
      /mask-icon/.test(rel) || /safari-pinned-tab|mask-icon/i.test(href);
    const isSvg = /svg/.test(type) || /\.svg(\?|$)/i.test(href);
    // 没写 sizes 的 rel=icon 默认按 32，别当大图
    const px = parseSizes($(el).attr("sizes")) ?? (isSvg ? 512 : 32);

    for (const url of expandHref(href, finalUrl)) {
      cands.push({ url, px, svg: isSvg, mask: isMask, from: "icon" });
    }
  });

  // ⑤ msapplication-TileImage（github 就有，144px 档）
  const ms = $('meta[name="msapplication-TileImage"]').attr("content");
  if (ms && !isDataUri(ms)) {
    for (const url of expandHref(ms, finalUrl)) {
      cands.push({ url, px: 144, from: "ms" });
    }
  }

  // ⑧ /favicon.ico 兜底，px 记 0，排在 96px 之后
  const fav = absolutize("/favicon.ico", finalUrl);
  if (fav) cands.push({ url: fav, px: 0, from: "favicon" });

  /*
   * 排序：apple 最大 → manifest → 彩色 SVG → icon ≥96 → ms → icon 小图
   *      → /favicon.ico → mask-icon
   * mask-icon 必须最后：它是 Safari 固定标签页的单色剪影，
   * tailwindcss / react.dev / astro.build 都有这个标签，排前面就拿到黑白图。
   */
  const rank = (c: IconCandidate): number => {
    if (c.from === "apple") return 0;
    if (c.from === "manifest") return 1;
    if (c.svg && !c.mask) return 2;
    if (!c.mask && c.px >= MIN_SHARP_PX) return 3;
    if (c.from === "ms") return 4;
    if (c.from === "favicon") return 5;
    if (c.mask) return 7;
    return 6;
  };

  cands.sort((a, b) => rank(a) - rank(b) || b.px - a.px);
  return cands;
}

/** 按顺序逐个验证，去重 */
async function firstRealIcon(cands: IconCandidate[]): Promise<string | null> {
  const seen = new Set<string>();
  for (const c of cands) {
    if (seen.has(c.url)) continue;
    seen.add(c.url);
    if (await isRealImage(c.url)) return c.url;
  }
  return null;
}

/**
 * 第三方兜底。只在 HTML 链路彻底失败时才发 —— 少一次外部请求，
 * 也少一次把「收藏了什么」泄露给第三方。
 *
 * 不用 unavatar：它命中时其实是转发 DuckDuckGo，未命中时返回
 * 200 + 自家 logo，状态码完全不可信。
 */
async function thirdPartyIcon(hostname: string): Promise<string | null> {
  /*
   * 三家一起发，按顺序取第一个可用的。
   *
   * 为什么要三家：生产机在国内，实测 google-s2 和 duckduckgo 直接
   * fetch failed，favicon.im 返回 403 —— 只写海外服务等于没有兜底。
   * favicon.cccyun.cc 是国内的，同一台机器上 200 / 1443B 正常。
   *
   * 并行而不是串行：串行最坏要等 3×4s，用户点「识别」会以为卡死。
   * 并发后总耗时等于最慢那家。
   */
  const urls = [
    `https://favicon.im/${hostname}?larger=true`,
    `https://favicon.cccyun.cc/${hostname}`,
    `https://www.google.com/s2/favicons?domain=${hostname}&sz=128`,
  ];

  const results = await Promise.all(
    urls.map((url) => isRealImage(url, { timeoutMs: THIRD_PARTY_TIMEOUT_MS })),
  );

  const hit = results.findIndex(Boolean);
  return hit >= 0 ? urls[hit] : null;
}

/**
 * 页面抓不到时的图标兜底（403 / 反爬站）。
 * 实测 8 个 403 站点（npmjs、知乎、Stack Overflow…）第三方服务全都能拿到真图标。
 */
export async function fetchIconFallback(rawUrl: string): Promise<string | null> {
  /*
   * 测试/离线开关：E2E 里不能真的去打外网，否则用例会随
   * 目标站点抽风、DNS 抖动而随机失败。
   */
  if (process.env.METADATA_DISABLED === "1") return null;
  try {
    const normalized = normalizeUrl(rawUrl);
    if (!normalized) return null;
    return await thirdPartyIcon(new URL(normalized).hostname);
  } catch {
    return null;
  }
}

/* ------------------------------ 简介 ------------------------------ */

const BOILER =
  /^(cookie|we use cookies|this (site|website) uses|本网站使用|本站使用|我们使用|同意|接受|accept all|subscribe|订阅|登录|注册|sign in|sign up|log in|already have an account|share|分享|advertisement|广告|上一篇|下一篇|skip to|跳至|sign up for free|关注我们|扫码)/i;

function clean(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function clip(text: string, max: number): string {
  const t = clean(text);
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/** 从 JSON-LD 里找 description（实测零增量，但成本低，兜结构化数据站） */
function jsonLdDescription($: cheerio.CheerioAPI): string | null {
  let found: string | null = null;

  const walk = (node: unknown, depth: number) => {
    if (found || depth > 6 || node === null || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }
    const obj = node as Record<string, unknown>;
    if (typeof obj.description === "string" && obj.description.trim().length > 20) {
      found = obj.description;
      return;
    }
    for (const value of Object.values(obj)) walk(value, depth + 1);
  };

  $('script[type="application/ld+json"]').each((_, el) => {
    if (found) return;
    try {
      walk(JSON.parse($(el).text()), 0);
    } catch {
      // 坏的 JSON-LD 直接忽略
    }
  });

  return found;
}

/**
 * 正文首段。
 * 51 个样本：只靠 meta 覆盖 76.1%，加上这个到 87.0%。
 * 在「服务端真的吐正文」的文章页上 7/11 命中，抽出来的确实是首段；
 * 列表页会正确返回 null —— 宁缺毋滥，别把导航文字塞进简介。
 */
function bodyLead(html: string): string | null {
  const $ = cheerio.load(html);

  // 去噪：脚本、表单、导航、页脚、侧栏、评论、分享、面包屑、分页、广告
  $(
    "script,style,noscript,template,iframe,svg,canvas,form,button,select,input,textarea," +
      "nav,header,footer,aside,figure,time",
  ).remove();
  $(
    '[class*="cookie" i],[id*="cookie" i],[class*="consent" i],[class*="sidebar" i],' +
      '[class*="comment" i],[class*="share" i],[class*="related" i],[class*="recommend" i],' +
      '[class*="breadcrumb" i],[class*="pagination" i],[class*="advert" i],[class*="banner" i],' +
      '[class*="newsletter" i],[role="navigation"],[role="banner"],[aria-hidden="true"]',
  ).remove();

  // 服务端没正文（SPA 壳 / 反爬占位页）就别硬抽
  if (clean($("body").text()).length < 300) return null;

  const pass = (text: string, $el: cheerio.Cheerio<never>): boolean => {
    if (text.length < 60 || text.length > 700) return false;
    if (BOILER.test(text)) return false;
    // 链接密度：导航/列表会很高
    if (clean($el.find("a").text()).length / text.length > 0.35) return false;
    // 没有句末标点，多半是标签云/按钮
    if (!/[。！？；.!?;]/.test(text)) return false;
    return true;
  };

  // 主容器优先，取文档序第一个合格段落（这才是真正的首段）
  const scopes = [
    "article",
    "main, [role=main], #main, .main",
    ".post-content, .entry-content, .article-content, .markdown-body, .prose, .post-body, #article_content, .article",
    "#content, .content",
  ];

  for (const sel of scopes) {
    const $scope = $(sel).first();
    if (!$scope.length) continue;

    let hit: string | null = null;
    $scope.find("p, dd, blockquote").each((_, el) => {
      if (hit) return;
      const $el = $(el) as unknown as cheerio.Cheerio<never>;
      const text = clean($el.text());
      if (pass(text, $el)) hit = text;
    });
    if (hit) return clip(hit, 200);
  }

  // 老站点没有 article/main：全页叶子块打分
  const cands: Array<{ text: string; score: number }> = [];
  $("p, dd, blockquote, div, span, section").each((_, el) => {
    const $el = $(el) as unknown as cheerio.Cheerio<never>;
    if ($el.find("p,div,li,section,article,ul,ol,table,pre").length) return;

    const text = clean($el.text());
    if (!pass(text, $el)) return;

    const density = clean($el.find("a").text()).length / text.length;
    const punct = (text.match(/[。！？；.!?;]/g) ?? []).length;
    cands.push({ text, score: Math.min(text.length, 400) * (1 - density) * (1 + punct * 0.1) });
  });

  if (cands.length) {
    cands.sort((a, b) => b.score - a.score);
    return clip(cands[0].text, 200);
  }

  /*
   * 最后一档：<br><br> 分段的老站。
   * paulgraham.com/do.html 全页 <p> 数为 0，只能按 br 切。
   */
  for (const block of html.split(/(?:<br\s*\/?>\s*){2,}/i)) {
    const $block = cheerio.load(`<div>${block}</div>`);
    $block("div").find("a").remove();
    const text = clean($block("div").text());
    if (text.length >= 80 && text.length <= 700 && !BOILER.test(text) && /[.!?。！？]/.test(text)) {
      return clip(text, 200);
    }
  }

  return null;
}

/* ------------------------------ 主流程 ------------------------------ */

export async function fetchPageMetadata(rawUrl: string): Promise<PageMetadata> {
  /* 同 fetchIconFallback：E2E 一律不联网 */
  if (process.env.METADATA_DISABLED === "1") {
    throw new MetadataError("已禁用外部抓取（METADATA_DISABLED=1）");
  }

  const normalized = normalizeUrl(rawUrl);
  if (!normalized) throw new MetadataError("不是合法的 http/https 地址");

  const { res, finalUrl, body } = await safeFetch(normalized);
  if (!res.ok) throw new MetadataError(`目标站点返回 ${res.status}`);

  const html = decode(body, sniffCharset(res.headers.get("content-type"), body));
  const $ = cheerio.load(html);

  const pick = (...xs: (string | undefined)[]) =>
    xs.map((x) => x?.replace(/\s+/g, " ").trim()).find((x) => x && x.length > 0) ?? null;

  const title = pick(
    $('meta[property="og:title"]').attr("content"),
    $('meta[name="twitter:title"]').attr("content"),
    $("title").first().text(),
    $("h1").first().text(),
  );

  /*
   * 简介兜底：og → meta description → twitter → JSON-LD → 正文首段。
   * twitter 和 JSON-LD 实测零增量，但都很便宜，留着兜住以后的结构化数据站。
   */
  const description = pick(
    $('meta[property="og:description"]').attr("content"),
    $('meta[name="description"]').attr("content"),
    $('meta[name="twitter:description"]').attr("content"),
    jsonLdDescription($) ?? undefined,
  );

  let finalDescription = description;
  if (!finalDescription) {
    finalDescription = bodyLead(html);
  }

  const cands = await collectIconCandidates($, finalUrl);
  let iconUrl = await firstRealIcon(cands);

  if (!iconUrl) {
    try {
      iconUrl = await thirdPartyIcon(new URL(finalUrl).hostname);
    } catch {
      iconUrl = null;
    }
  }

  return {
    title: title ? title.slice(0, 300) : null,
    description: finalDescription ? finalDescription.slice(0, 500) : null,
    iconUrl,
    finalUrl,
  };
}
