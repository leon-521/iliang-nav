import { z } from "zod";
import { MAX_BOOKMARK_TAGS, parseBookmarkTags } from "@/lib/bookmarks/tags";
import { parseNetscape } from "./netscape";
import { normalizeUrl } from "./url";

export type TransferFormat = "html" | "json" | "csv";
export const MAX_ROWS = 20_000;
export const MAX_DEPTH = 64;
const visibility = z.enum(["public", "unlisted", "private"]);
const id = z.string().trim().min(1).max(120);
const sort = z.number().int().min(-2147483648).max(2147483647);
const timestamp = z.number().int().min(0).max(253402300799);
const label = (max: number) => z.string().trim().max(max).refine((value) => !value.includes("\0"));
const folderName = label(60).refine(Boolean);
const folderPath = z.array(folderName).max(MAX_DEPTH);

export const librarySettingsSchema = z.object({
  siteName: label(40).refine(Boolean).optional(), siteTagline: label(80).optional(),
  ownerName: label(20).optional(), footerText: label(160).optional(), showIcons: z.boolean().optional(),
  quickToolIds: z.array(id).max(MAX_BOOKMARK_TAGS).optional(), quickToolsManual: z.boolean().optional(),
});

const bookmarkSchema = z.object({
  id: id.optional(), categoryId: id.nullable().optional(), url: label(4096).refine(Boolean),
  title: label(300), description: label(500).nullish(), altUrl: label(4096).nullish(),
  iconUrl: label(4096).nullish(), iconHidden: z.boolean().optional(),
  visibility: visibility.nullable().optional(), sortOrder: sort.optional(), createdAt: timestamp.optional(),
  tags: z.array(z.string().max(128)).max(MAX_BOOKMARK_TAGS).optional(),
});
const categorySchema = z.object({ id, parentId: id.nullable(), name: folderName, visibility: visibility.optional(), sortOrder: sort.optional(), createdAt: timestamp.optional() });
const jsonSchema = z.object({
  format: z.literal("iliang-nav-library"), version: z.literal(1),
  categories: z.array(categorySchema).max(MAX_ROWS), bookmarks: z.array(bookmarkSchema).max(MAX_ROWS),
  settings: librarySettingsSchema.optional(),
});

export type LibrarySettings = z.infer<typeof librarySettingsSchema>;
export type TransferCategory = z.infer<typeof categorySchema> & { path: string[] };
export type TransferBookmark = z.infer<typeof bookmarkSchema> & { folderPath: string[] };
export type TransferLibrary = { format: TransferFormat; bookmarks: TransferBookmark[]; categories: TransferCategory[]; settings?: LibrarySettings; invalid: number };

/** Only HTTP(S) bookmarks without embedded credentials; never fetch imported URLs here. */
export function transferUrl(raw: string): string | null {
  if (raw.length > 4096 || /[\u0000-\u001f\u007f]/.test(raw)) return null;
  try {
    const value = raw.trim();
    let url: URL;
    try { url = new URL(value); } catch { url = new URL(`https://${value}`); }
    if (url.username || url.password) return null;
    const normalized = normalizeUrl(value);
    return normalized && normalized.length <= 4096 ? normalized : null;
  } catch { return null; }
}

export function portableIcon(raw: string | null | undefined): string | null {
  return raw && /^https?:\/\//i.test(raw) ? transferUrl(raw) : null;
}

export function validTags(values: string[]): string[] {
  const parsed = parseBookmarkTags(values.join(","));
  if (!parsed.tags) throw new Error("标签不符合长度或数量限制");
  return parsed.tags;
}

function readJson(input: string): TransferLibrary {
  let decoded: unknown;
  try { decoded = JSON.parse(input); } catch { throw new Error("JSON 格式无效"); }
  const parsed = jsonSchema.safeParse(decoded);
  if (!parsed.success) throw new Error("不是受支持的 iliang nav JSON 书签库（版本 1），或数据超出限制");
  const archive = parsed.data;
  const categories: TransferCategory[] = [];
  const byId = new Map(archive.categories.map((row) => [row.id, row]));
  if (byId.size !== archive.categories.length) throw new Error("JSON 中有重复的分类 ID");
  const resolved = new Map<string, TransferCategory>();
  function visit(key: string, visiting: Set<string>): TransferCategory {
    const done = resolved.get(key);
    if (done) return done;
    if (visiting.has(key) || visiting.size >= MAX_DEPTH) throw new Error("分类层级存在循环或超过 64 级");
    const row = byId.get(key);
    if (!row) throw new Error("JSON 中有不存在的分类引用");
    visiting.add(key);
    const parent = row.parentId === null ? [] : visit(row.parentId, visiting).path;
    if (parent.length >= MAX_DEPTH) throw new Error("分类层级超过 64 级");
    const item = { ...row, path: [...parent, row.name] };
    visiting.delete(key);
    resolved.set(key, item);
    categories.push(item);
    return item;
  }
  archive.categories.forEach(({ id }) => visit(id, new Set()));
  const ids = new Set<string>();
  const bookmarks = archive.bookmarks.map((row) => {
    if (row.id !== undefined && ids.has(row.id)) throw new Error("JSON 中有重复的书签 ID");
    if (row.id !== undefined) ids.add(row.id);
    return { ...row, tags: validTags(row.tags ?? []), folderPath: row.categoryId == null ? [] : visit(row.categoryId, new Set()).path };
  });
  return { format: "json", categories, bookmarks, invalid: 0, settings: archive.settings };
}

/** RFC 4180 quoting, including escaped quotes and multiline cells. Bounded by file size upstream. */
function csvRows(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false, closed = false;
  const addCell = () => { row.push(cell); if (row.length > 64) throw new Error("CSV 列过多"); cell = ""; closed = false; };
  const addRow = () => { addCell(); if (row.some((value) => value !== "")) rows.push(row); row = []; if (rows.length > MAX_ROWS + 1) throw new Error("CSV 书签数量超出限制"); };
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch !== '"') cell += ch;
      else if (input[i + 1] === '"') { cell += '"'; i++; }
      else { quoted = false; closed = true; }
    } else if (ch === ",") addCell();
    else if (ch === "\r" || ch === "\n") { if (ch === "\r" && input[i + 1] === "\n") i++; addRow(); }
    else if (!cell && !closed && ch === '"') quoted = true;
    else if (closed || ch === '"') throw new Error("CSV 引号格式无效");
    else cell += ch;
  }
  if (quoted) throw new Error("CSV 缺少结束引号");
  if (row.length || cell || closed) addRow();
  return rows;
}

const formulaLike = /^(?:[\t\r\n]|\s*[=+\-@＝＋－＠])/u;
const escapeSpreadsheet = (value: string) => formulaLike.test(value) || value.startsWith("'") ? `'${value}` : value;
function unescapeSpreadsheet(value: string): string {
  const tail = value.slice(1);
  return value.startsWith("'") && (formulaLike.test(tail) || tail.startsWith("'")) ? tail : value;
}

export const csvColumns = ["url", "title", "description", "category_path", "tags", "alt_url", "visibility", "sort_order", "created_at", "icon_url", "icon_hidden", "iliang_nav_csv"];

export function encodeCsv(rows: string[][]): string {
  const quote = (s: string) => `"${s.replace(/"/g, '""')}"`;
  return "\uFEFF" + [csvColumns.map(quote).join(","), ...rows.map((row) => [...row.map(escapeSpreadsheet), "1"].map(quote).join(","))].join("\r\n") + "\r\n";
}

function readCsv(input: string): TransferLibrary {
  const [head, ...rows] = csvRows(input);
  const cols = head?.map((name) => name.trim().toLowerCase());
  if (!cols?.includes("url") || new Set(cols).size !== cols.length) throw new Error("CSV 需要不重复的列名，至少包含 url 列");
  const index = new Map(cols.map((col, i) => [col, i]));
  const items: TransferBookmark[] = [];
  let invalid = 0;
  for (const row of rows) {
    const raw = (name: string) => row[index.get(name) ?? -1] ?? "";
    const cell = (name: string) => raw("iliang_nav_csv") === "1" ? unescapeSpreadsheet(raw(name)) : raw(name);
    try {
      if (row.length > cols.length) throw new Error();
      const path = (cell("category_path") || cell("category")).trim();
      const names = folderPath.parse(path.startsWith("[") ? JSON.parse(path) : path.split("/").map((part) => part.trim()).filter(Boolean));
      const tagsInput = cell("tags").trim();
      const parsedTags = tagsInput.startsWith("[") ? z.array(z.string()).max(MAX_BOOKMARK_TAGS).parse(JSON.parse(tagsInput)) : [tagsInput];
      const record = bookmarkSchema.parse({
        url: cell("url"), title: cell("title"), description: cell("description") || undefined,
        altUrl: cell("alt_url") || undefined, iconUrl: cell("icon_url") || undefined,
        iconHidden: cell("icon_hidden") === "1", visibility: cell("visibility").trim() || undefined,
        sortOrder: cell("sort_order").trim() ? Number(cell("sort_order")) : undefined,
        createdAt: cell("created_at").trim() ? Number(cell("created_at")) : undefined,
        tags: validTags(parsedTags),
      });
      items.push({ ...record, folderPath: names });
    } catch { invalid++; }
  }
  return { format: "csv", bookmarks: items, categories: [], invalid };
}

export function parseTransfer(input: string, format: TransferFormat): TransferLibrary {
  const text = input.replace(/^\uFEFF/u, "");
  if (format === "json") return readJson(text);
  if (format === "csv") return readCsv(text);
  const html = parseNetscape(text);
  if (html.bookmarks.length > MAX_ROWS || html.folders.length > MAX_ROWS) throw new Error("HTML 书签或分类数量超出限制");
  const cleanPath = (path: string[]) => path.slice(0, MAX_DEPTH).map((name) => name.slice(0, 60).replaceAll("\0", "").trim()).filter(Boolean);
  return {
    format: "html", invalid: html.invalid,
    bookmarks: html.bookmarks.map((row) => ({ ...row, createdAt: Number.isFinite(row.addDate) && row.addDate! > 0 && row.addDate! <= 253402300799 ? Math.floor(row.addDate!) : undefined, folderPath: cleanPath(row.folderPath) })),
    categories: html.folders.map(({ path, name }, i) => ({ id: `html-${i}`, parentId: null, name, path: cleanPath(path) })),
  };
}
