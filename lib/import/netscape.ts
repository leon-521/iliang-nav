/**
 * Netscape Bookmark File 解析器
 *
 * 为什么不用 DOM 树？
 * Chrome / Firefox / Safari 导出的 HTML 里 <DT> / <DD> 大量不闭合，
 * 任何 HTML 解析器（包括浏览器）都会「修复」出一个和原意不同的树结构，
 * 导致文件夹层级错乱、书签重复。实测 cheerio 会把嵌套 <DL> 塞进 <DT> 里。
 *
 * 所以这里用「按文档顺序扫描标签」的方式，只依赖出现次序，不依赖嵌套合法性：
 *   <H3>名字</H3>  → 记下待打开的文件夹名
 *   <DL>           → 压栈（用待打开的名字，没有则压 null 占位）
 *   </DL>          → 出栈
 *   <A HREF=..>    → 归入当前栈路径
 */

export type ParsedBookmark = {
  url: string;
  title: string;
  description?: string;
  /** 从根到当前文件夹的名字路径 */
  folderPath: string[];
  addDate?: number;
};

export type ParsedFolder = {
  path: string[];
  name: string;
};

export type ParseResult = {
  bookmarks: ParsedBookmark[];
  folders: ParsedFolder[];
  /** 解析失败的条目数（无 href / 非法 scheme） */
  invalid: number;
};

const SKIP_SCHEMES = ["javascript:", "data:", "chrome:", "about:", "file:", "place:"];

function isUsableUrl(href: string): boolean {
  const h = href.trim().toLowerCase();
  if (!h) return false;
  return !SKIP_SCHEMES.some((s) => h.startsWith(s));
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]*>/g, "")).trim();
}

/** 从标签串里取属性，兼容 HREF / href / HREF="..." 无引号 */
function attr(tag: string, name: string): string | undefined {
  const re = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const m = tag.match(re);
  if (!m) return undefined;
  return decodeEntities(m[2] ?? m[3] ?? m[4] ?? "");
}

const TAG_RE = /<(\/?)(dl|dt|dd|h3|a)\b([^>]*)>|<\/\s*(dl|dt|dd|h3|a)\s*>/gi;

export function parseNetscape(html: string): ParseResult {
  const bookmarks: ParsedBookmark[] = [];
  const folderMap = new Map<string, ParsedFolder>();
  const stack: string[] = [];

  let invalid = 0;
  let pendingFolder: string | null = null;
  let pendingBookmark: { url: string; title: string; addDate?: number } | null = null;
  let lastBookmark: ParsedBookmark | null = null;
  let capturing: "h3" | "a" | "dd" | null = null;

  const recordFolder = () => {
    const path = stack.filter(Boolean);
    if (path.length === 0) return;
    const key = path.join("\u0000");
    if (!folderMap.has(key)) {
      folderMap.set(key, { path, name: path[path.length - 1] });
    }
  };

  let cursor = 0;
  const pushText = (text: string) => {
    if (!text) return;
    if (capturing === "h3" && pendingFolder !== null) {
      pendingFolder += text;
    } else if (capturing === "a" && pendingBookmark) {
      pendingBookmark.title += text;
    } else if (capturing === "dd" && lastBookmark) {
      const next = `${lastBookmark.description ?? ""}${text}`;
      lastBookmark.description = next.trim().slice(0, 500) || undefined;
    }
  };

  let m: RegExpExecArray | null;
  while ((m = TAG_RE.exec(html)) !== null) {
    // 标签之间的文本
    pushText(stripTags(html.slice(cursor, m.index)));
    cursor = TAG_RE.lastIndex;

    const closing = m[1] === "/" || m[4] !== undefined;
    const tag = (m[2] ?? m[4] ?? "").toLowerCase();
    const attrs = m[3] ?? "";

    if (!closing) {
      if (tag === "h3") {
        pendingFolder = "";
        capturing = "h3";
      } else if (tag === "dl") {
        if (pendingFolder !== null && pendingFolder.trim()) {
          stack.push(pendingFolder.trim());
          recordFolder();
        } else {
          // 匿名层（根 DL 或结构异常），压空串占位以便正确出栈
          stack.push("");
        }
        pendingFolder = null;
        capturing = null;
      } else if (tag === "a") {
        const href = attr(attrs, "href");
        if (!href || !isUsableUrl(href)) {
          invalid++;
          pendingBookmark = null;
          capturing = null;
        } else {
          pendingBookmark = {
            url: href.trim(),
            title: "",
            addDate: Number(attr(attrs, "add_date") ?? 0) || undefined,
          };
          capturing = "a";
        }
      } else if (tag === "dd") {
        capturing = "dd";
      }
    } else {
      if (tag === "h3") {
        capturing = null;
      } else if (tag === "a") {
        if (pendingBookmark) {
          const path = stack.filter(Boolean);
          const bm: ParsedBookmark = {
            url: pendingBookmark.url,
            title: pendingBookmark.title.trim() || pendingBookmark.url,
            folderPath: path,
            addDate: pendingBookmark.addDate,
          };
          bookmarks.push(bm);
          lastBookmark = bm;
          pendingBookmark = null;
        }
        capturing = null;
      } else if (tag === "dd") {
        capturing = null;
      } else if (tag === "dl") {
        stack.pop();
        capturing = null;
      }
    }
  }

  // 兜底：完全没有 DL 结构时，扫所有 <a>
  if (bookmarks.length === 0) {
    const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
    let mm: RegExpExecArray | null;
    while ((mm = re.exec(html)) !== null) {
      const href = attr(mm[1], "href");
      if (!href || !isUsableUrl(href)) {
        invalid++;
        continue;
      }
      bookmarks.push({
        url: href.trim(),
        title: stripTags(mm[2]) || href,
        folderPath: [],
      });
    }
  }

  return {
    bookmarks,
    folders: [...folderMap.values()],
    invalid,
  };
}

/** 把文件夹路径裁到最多 3 级（PRD 约定） */
export function clampPath(path: string[], maxDepth = 3): string[] {
  return path.slice(0, maxDepth);
}

/* ------------------------------------------------------------------ */
/* 导出                                                                */
/* ------------------------------------------------------------------ */

export type ExportBookmark = {
  url: string;
  title: string;
  description?: string | null;
  /** 从根到所在文件夹的名字路径；空数组表示直接挂在根下 */
  folderPath: string[];
  addDate?: number | null;
  iconUrl?: string | null;
};

export type ExportInput = {
  bookmarks: ExportBookmark[];
  /** 没有任何书签的空文件夹也要导出，否则结构会丢 */
  emptyFolders?: string[][];
  /** 导出时间，写进文件头的注释 */
  exportedAt?: Date;
  /** 站点名，写进 H1 */
  title?: string;
};

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * 生成 Netscape Bookmark File（Chrome / Firefox / Safari / Edge 都认）。
 *
 * 为什么这件事重要：这是唯一一个**所有浏览器原生支持**的导出格式。
 * 没有它，用户的数据就锁在这个站里 —— 哪天不想要了，只能一条条手抄。
 * 有了它，随时能带着数据走人，这本身就是一种产品自信。
 *
 * 输出结构（和浏览器导出的保持一致，缩进按层级）：
 *   <DL><p>
 *     <DT><H3>文件夹</H3>
 *     <DL><p>
 *       <DT><A HREF="..." ADD_DATE="...">标题</A>
 *     </DL><p>
 *   </DL><p>
 */
export function serializeNetscape(input: ExportInput): string {
  const at = input.exportedAt ?? new Date();
  const stamp = Math.floor(at.getTime() / 1000);
  const siteTitle = input.title ?? "书签";

  /*
   * 先把「路径 → 书签列表」和「路径 → 子文件夹」建好。
   * 直接按数组顺序嵌套输出是不可靠的：书签的顺序不保证父目录先出现。
   */
  const byFolder = new Map<string, ExportBookmark[]>();
  const childFolders = new Map<string, Set<string>>();
  const allFolders = new Set<string>();

  const keyOf = (p: string[]) => p.join("\u0000");

  const ensurePath = (path: string[]) => {
    for (let i = 1; i <= path.length; i++) {
      const sub = path.slice(0, i);
      const k = keyOf(sub);
      allFolders.add(k);
      const parentKey = keyOf(sub.slice(0, i - 1));
      if (!childFolders.has(parentKey)) childFolders.set(parentKey, new Set());
      childFolders.get(parentKey)!.add(k);
    }
  };

  for (const folder of input.emptyFolders ?? []) {
    if (folder.length > 0) ensurePath(folder);
  }

  for (const b of input.bookmarks) {
    const path = b.folderPath ?? [];
    if (path.length > 0) ensurePath(path);
    const k = keyOf(path);
    if (!byFolder.has(k)) byFolder.set(k, []);
    byFolder.get(k)!.push(b);
  }

  const lines: string[] = [];
  lines.push("<!DOCTYPE NETSCAPE-Bookmark-file-1>");
  lines.push("<!-- This is an automatically generated file.");
  lines.push("     It will be read and overwritten.");
  lines.push("     DO NOT EDIT! -->");
  lines.push('<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">');
  lines.push("<TITLE>Bookmarks</TITLE>");
  lines.push(`<H1>${esc(siteTitle)}</H1>`);
  lines.push("<DL><p>");

  const indent = (depth: number) => "    ".repeat(depth + 1);

  /*
   * 递归输出。用显式栈而不是真递归，是为了避免脏数据里出现
   * A→B→A 这种环时把调用栈打爆（导入来的数据什么形状都可能有）。
   */
  const walk = (folderKey: string, depth: number) => {
    const items = byFolder.get(folderKey) ?? [];
    for (const b of items) {
      const attrs = [`HREF="${esc(b.url)}"`];
      if (b.addDate) attrs.push(`ADD_DATE="${Math.floor(b.addDate)}"`);
      /*
       * ICON 是 Netscape 格式的私有扩展，Chrome 会忽略，
       * 但 Firefox 和老式书签工具认它。写上不吃亏。
       * 本地图标是相对路径，导出时必须补成绝对地址，否则换台机器就是死链。
       */
      if (b.iconUrl) attrs.push(`ICON="${esc(b.iconUrl)}"`);
      lines.push(`${indent(depth)}<DT><A ${attrs.join(" ")}>${esc(b.title || b.url)}</A>`);
      if (b.description) {
        lines.push(`${indent(depth)}<DD>${esc(b.description)}`);
      }
    }

    const children = [...(childFolders.get(folderKey) ?? [])];
    /* 按路径排序，保证同一份数据每次导出的顺序一致，便于 diff */
    children.sort((a, b) => a.localeCompare(b, "zh-CN"));
    for (const childKey of children) {
      const path = childKey.split("\u0000");
      const name = path[path.length - 1];
      lines.push(`${indent(depth)}<DT><H3>${esc(name)}</H3>`);
      lines.push(`${indent(depth)}<DL><p>`);
      walk(childKey, depth + 1);
      lines.push(`${indent(depth)}</DL><p>`);
    }
  };

  walk("", 0);

  lines.push("</DL><p>");
  lines.push("");
  return lines.join("\n");
}
