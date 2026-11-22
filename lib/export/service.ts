import { asc } from "drizzle-orm";
import { getSettings } from "@/lib/settings/service";
import { tagsByBookmark } from "@/lib/bookmarks/tag-store";
import { encodeCsv, portableIcon, type TransferFormat } from "@/lib/import/formats";
import { db } from "@/lib/db";
import { bookmarks, categories } from "@/lib/db/schema";
import { serializeNetscape, type ExportBookmark } from "@/lib/import/netscape";

/**
 * 导出全部书签。
 *
 * 两个刻意的选择：
 *  1. 走 service 层直查 db，不复用公开域的 visibleWhere —— 导出是管理员
 *     给自己做备份，私有书签恰恰是最需要导出的那部分，不能被过滤掉。
 *  2. 分类层级用 parentId 现拼路径，不依赖 sortOrder 或导入时残留的
 *     扁平结构，保证导出结构和后台看到的一致。
 */

type CategoryRow = {
  id: string;
  parentId: string | null;
  name: string;
  sortOrder: number;
};

/** 从某分类往上走，拼出 [根, ..., 自身] 的路径 */
function buildPath(
  id: string | null,
  byId: Map<string, CategoryRow>,
): string[] {
  const path: string[] = [];
  const seen = new Set<string>();
  let cur = id;
  while (cur) {
    if (seen.has(cur)) break; // 脏数据防环
    seen.add(cur);
    const row = byId.get(cur);
    if (!row) break;
    path.unshift(row.name);
    cur = row.parentId;
  }
  return path;
}

export type ExportResult = {
  html: string;
  count: number;
  /** 生成的文件名，带日期便于区分多次导出 */
  filename: string;
};

export function exportNetscape(opts?: { baseUrl?: string }): ExportResult {
  const base = (opts?.baseUrl ?? process.env.PUBLIC_BASE_URL ?? "").replace(/\/$/, "");

  const cats = db
    .select({
      id: categories.id,
      parentId: categories.parentId,
      name: categories.name,
      sortOrder: categories.sortOrder,
    })
    .from(categories)
    .orderBy(asc(categories.sortOrder))
    .all();

  const byId = new Map(cats.map((c) => [c.id, c as CategoryRow]));

  const rows = db
    .select({
      url: bookmarks.url,
      title: bookmarks.title,
      description: bookmarks.description,
      iconUrl: bookmarks.iconUrl,
      categoryId: bookmarks.categoryId,
      createdAt: bookmarks.createdAt,
    })
    .from(bookmarks)
    .orderBy(asc(bookmarks.sortOrder), asc(bookmarks.createdAt))
    .all();

  const items: ExportBookmark[] = rows.map((r) => ({
    url: r.url,
    title: r.title,
    description: r.description,
    folderPath: buildPath(r.categoryId, byId),
    addDate: r.createdAt,
    /*
     * 本地图标存的是 /icons/xxx.png，导出必须补成绝对地址，
     * 否则换台机器导入后就是一片死链。
     */
    iconUrl: r.iconUrl
      ? r.iconUrl.startsWith("/")
        ? `${base}${r.iconUrl}`
        : r.iconUrl
      : null,
  }));

  // Register every category first so the HTML serializer keeps sibling order,
  // including categories without any bookmarks.
  const emptyFolders = cats.map((c) => buildPath(c.id, byId)).filter((path) => path.length > 0);

  const now = new Date();
  const html = serializeNetscape({
    bookmarks: items,
    emptyFolders,
    exportedAt: now,
    title: "书签",
  });

  const d = now.toISOString().slice(0, 10);
  return { html, count: items.length, filename: `bookmarks-${d}.html` };
}

export function exportLibrary(format: TransferFormat): { body: string; filename: string; contentType: string } {
  if (format === "html") {
    const { html, filename } = exportNetscape();
    return { body: html, filename, contentType: "text/html; charset=utf-8" };
  }
  const archive = db.transaction((tx) => {
    const folders = tx.select({ id: categories.id, parentId: categories.parentId, name: categories.name,
      sortOrder: categories.sortOrder, visibility: categories.visibility, createdAt: categories.createdAt })
      .from(categories).orderBy(asc(categories.sortOrder), asc(categories.createdAt), asc(categories.id)).all();
    const rows = tx.select({ id: bookmarks.id, categoryId: bookmarks.categoryId, url: bookmarks.url,
      title: bookmarks.title, description: bookmarks.description, altUrl: bookmarks.altUrl, iconUrl: bookmarks.iconUrl,
      iconHidden: bookmarks.iconHidden, visibility: bookmarks.visibility, sortOrder: bookmarks.sortOrder, createdAt: bookmarks.createdAt })
      .from(bookmarks).orderBy(asc(bookmarks.sortOrder), asc(bookmarks.createdAt), asc(bookmarks.id)).all();
    const tags = tagsByBookmark(rows.map(({ id }) => id));
    const { siteName, siteTagline, ownerName, footerText, showIcons, quickToolIds, quickToolsManual } = getSettings();
    return {
      format: "iliang-nav-library", version: 1, categories: folders,
      bookmarks: rows.map((row) => ({ ...row, iconUrl: portableIcon(row.iconUrl), tags: tags.get(row.id) ?? [] })),
      settings: { siteName, siteTagline, ownerName, footerText, showIcons, quickToolIds, quickToolsManual },
    };
  });
  const day = new Date().toISOString().slice(0, 10);
  if (format === "json") return { body: JSON.stringify(archive, null, 2), filename: `bookmark-library-${day}.json`, contentType: "application/json; charset=utf-8" };
  const byId = new Map(archive.categories.map((row) => [row.id, row]));
  const rows = archive.bookmarks.map((row) => {
    const category = row.categoryId ? byId.get(row.categoryId) : undefined;
    // CSV intentionally flattens category metadata, so carry the effective visibility.
    const visible = category && category.visibility !== "public" ? "private" : row.visibility ?? category?.visibility ?? "private";
    return [row.url, row.title, row.description ?? "", JSON.stringify(buildPath(row.categoryId, byId)), JSON.stringify(row.tags),
      row.altUrl ?? "", visible, String(row.sortOrder), String(row.createdAt), row.iconUrl ?? "", row.iconHidden ? "1" : "0"];
  });
  return { body: encodeCsv(rows), filename: `bookmarks-${day}.csv`, contentType: "text/csv; charset=utf-8" };
}

/** 只数一下，给设置页显示「共 N 条可导出」 */
export function exportableCount(): number {
  const row = db.select({ n: db.$count(bookmarks) }).from(bookmarks).get();
  return Number(row?.n ?? 0);
}
