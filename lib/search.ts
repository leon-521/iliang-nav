import { sqlite } from "@/lib/db";
import { tagKey } from "@/lib/bookmarks/tags";
import type { Viewer } from "@/lib/auth/session";

/**
 * 搜索语法：
 *   #tag / #"multi word"  按完整标签
 *   site:domain   按域名
 *   "短语"         精确短语
 *   其余            普通关键词（AND）
 */
export type ParsedQuery = {
  terms: string[];
  tags: string[];
  sites: string[];
};

export function parseQuery(raw: string): ParsedQuery {
  const terms: string[] = [];
  const tags: string[] = [];
  const sites: string[] = [];

  const re = /(#?)"((?:\\["\\]|[^"\\]|\\(?!["\\]))*)"|(\S+)/gu;
  for (const match of raw.matchAll(re)) {
    if (match[2] !== undefined) {
      const phrase = match[2].replace(/\\(["\\])/g, "$1");
      if (match[1]) {
        const key = tagKey(phrase);
        if (key) tags.push(key);
      } else if (phrase) terms.push(phrase);
      continue;
    }

    const token = match[3];
    if (token.startsWith("#") && token.length > 1) tags.push(tagKey(token.slice(1)));
    else if (/^site:/i.test(token)) sites.push(token.slice(5).replace(/^www\./i, ""));
    else terms.push(token);
  }

  return { terms, tags, sites };
}

/** 把用户输入转成安全的 FTS5 MATCH 表达式（转义引号、加前缀通配） */
function toFtsExpr(terms: string[]): string {
  return terms
    .map((t) => {
      const safe = t.replace(/"/g, '""');
      return `"${safe}"*`;
    })
    .join(" AND ");
}

/**
 * LIKE 转义。
 *
 * 用户搜「100%」时，裸的 % 会变成通配符，把整库都匹配出来。
 * 这里用 ESCAPE '\' 把它降级成普通字符。
 */
function likeArg(term: string): string {
  return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export type SearchHit = {
  id: string;
  title: string;
  url: string;
  description: string | null;
  categoryId: string | null;
  iconUrl: string | null;
  iconHidden: boolean;
  effectiveVisibility: string;
  rank: number;
};

type Predicate = { sql: string; params: unknown[] } | null;

/**
 * 除关键词以外的筛选条件（site: / #tag / 可见性）。
 * 两条检索路径共用，避免复制粘贴时漏掉可见性 —— 那是安全问题。
 */
function buildFilters(q: ParsedQuery, viewer: Viewer): {
  clauses: string[];
  params: unknown[];
} {
  const clauses: string[] = [];
  const params: unknown[] = [];

  for (const site of q.sites) {
    clauses.push("b.url LIKE ?");
    params.push(`%//${site}%`);
  }

  for (const tag of q.tags) {
    clauses.push(
      "b.id IN (SELECT bt.bookmark_id FROM bookmark_tags bt JOIN tags t ON t.id = bt.tag_id WHERE t.slug = ?)",
    );
    params.push(tag);
  }

  // 可见性：匿名只看得见 public，且分类也必须 public
  if (viewer.kind !== "admin") {
    clauses.push("b.effective_visibility = 'public'");
    clauses.push(
      "(b.category_id IS NULL OR b.category_id IN (SELECT id FROM categories WHERE visibility = 'public'))",
    );
  }

  return { clauses, params };
}

function runQuery(
  q: ParsedQuery,
  viewer: Viewer,
  termPredicate: Predicate,
  limit: number,
): Array<Record<string, unknown>> {
  const { clauses, params } = buildFilters(q, viewer);
  if (termPredicate) {
    clauses.push(termPredicate.sql);
    params.push(...termPredicate.params);
  }

  const sql = `
    SELECT b.id, b.title, b.url, b.description, b.category_id AS categoryId,
           b.icon_url AS iconUrl, b.icon_hidden AS iconHidden,
           b.effective_visibility AS effectiveVisibility,
           0 AS rank
    FROM bookmarks b
    ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
    ORDER BY b.sort_order ASC, b.created_at DESC
    LIMIT ?
  `;

  return sqlite.prepare(sql).all(...params, limit) as Array<
    Record<string, unknown>
  >;
}

export function searchBookmarks(
  raw: string,
  viewer: Viewer,
  limit = 60,
): SearchHit[] {
  const q = parseQuery(raw);

  let rows: Array<Record<string, unknown>>;

  if (q.terms.length === 0) {
    rows = runQuery(q, viewer, null, limit);
  } else {
    /*
     * 先走 FTS5，搜不到再退回 LIKE 子串匹配。
     *
     * 为什么需要这一层：FTS5 的 unicode61 分词器把连续的 CJK 字符
     * 当成**一个 token**，只支持前缀匹配。所以「可视化管理面板」这条
     * 能搜到「可视」，却搜不到「管理」「面板」—— 而中文用户最常搜的
     * 恰恰是两字词（面板 / 文档 / 资源 / 服务），全部落在 token 中间。
     *
     * 实测生产库 10 个常用词：LIKE 命中 22 条，FTS 只命中 2 条。
     * 也就是说修之前中文搜索基本是坏的。
     *
     * trigram 分词器救不了：它要求查询 ≥3 字符，两字词照样 0 命中。
     *
     * 除 FTS 外，对标签和文本再做一次子串匹配，补齐剩余结果。
     */
    rows = runQuery(
      q,
      viewer,
      { sql: `b.id IN (SELECT bookmark_id FROM bookmarks_fts WHERE bookmarks_fts MATCH ?)`, params: [toFtsExpr(q.terms)] },
      limit,
    );

    if (rows.length < limit) {
      const textMatch = "(b.title LIKE ? ESCAPE '\\' OR COALESCE(b.description, '') LIKE ? ESCAPE '\\' OR b.url LIKE ? ESCAPE '\\')";
      const tagMatch = "EXISTS (SELECT 1 FROM bookmark_tags bt JOIN tags t ON t.id = bt.tag_id WHERE bt.bookmark_id = b.id AND t.slug LIKE ? ESCAPE '\\')";
      const termClauses = q.terms.map(() => `(${textMatch} OR ${tagMatch})`);
      const termParams = q.terms.flatMap((term) => {
        const arg = likeArg(term);
        return [arg, arg, arg, likeArg(tagKey(term))];
      });

      // Keep the existing FTS results first, then supplement with substring and tag
      // matches. A book can match one keyword in its title and the other in a tag.
      const seen = new Set(rows.map((row) => row.id));
      const extra = runQuery(q, viewer, { sql: `(${termClauses.join(" AND ")})`, params: termParams }, limit);
      rows.push(...extra.filter((row) => !seen.has(row.id)).slice(0, limit - rows.length));
    }
  }

  return rows.map((r) => ({
    id: String(r.id),
    title: String(r.title),
    url: String(r.url),
    description: r.description ? String(r.description) : null,
    categoryId: r.categoryId ? String(r.categoryId) : null,
    iconUrl: r.iconUrl ? String(r.iconUrl) : null,
    iconHidden: Boolean(r.iconHidden),
    effectiveVisibility: String(r.effectiveVisibility),
    rank: 0,
  }));
}
