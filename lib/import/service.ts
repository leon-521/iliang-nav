import { asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookmarks, categories, settings } from "@/lib/db/schema";
import { replaceBookmarkTags } from "@/lib/bookmarks/tag-store";
import { MAX_DEPTH, MAX_ROWS, parseTransfer, portableIcon, transferUrl, type TransferCategory, type TransferFormat, type TransferLibrary } from "./formats";
import { hashUrl } from "./url";

export type ImportOptions = { mapFolders: boolean; applySettings?: boolean; preserveVisibility?: boolean };
export type ImportPreview = {
  format: TransferFormat; total: number; willCreate: number; duplicates: number; invalid: number;
  newFolders: string[]; newFolderCount: number; hasSettings: boolean;
  sample: Array<{ title: string; url: string; folderPath: string[]; duplicate: boolean; invalid: boolean }>;
};
export type ImportResult = { created: number; skipped: number; invalid: number; foldersCreated: number; settingsAdded: number };

type Folder = { id: string; parentId: string | null; name: string; visibility: string; sortOrder: number };
const key = (parentId: string | null, name: string) => `${parentId ?? ""}\0${name}`;
const pathKey = (path: string[]) => JSON.stringify(path);
const slugify = (name: string, id: string) => `${name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "") || "folder"}-${id}`;

function prepare(library: TransferLibrary, opts: ImportOptions, existing: Folder[], oldBookmarks: Map<string, string>) {
  const byName = new Map<string, Folder[]>();
  for (const row of existing) {
    const k = key(row.parentId, row.name);
    const siblings = byName.get(k) ?? [];
    siblings.push(row);
    byName.set(k, siblings);
  }
  const parentOrder = new Map<string | null, number>();
  for (const row of existing) parentOrder.set(row.parentId, Math.max(parentOrder.get(row.parentId) ?? -1, row.sortOrder));
  const generated: (Folder & { path: string[]; createdAt?: number })[] = [];
  const categoriesByArchiveId = new Map<string, Folder>();
  const categoriesByPath = new Map<string, Folder>();
  const usedExisting = new Set<string>();

  function addFolder(parentId: string | null, name: string, path: string[], source?: TransferCategory): Folder {
    const k = key(parentId, name);
    const matches = byName.get(k) ?? [];
    const existing = source ? matches.find((row) => !usedExisting.has(row.id)) : matches[0];
    if (existing) {
      if (source) usedExisting.add(existing.id);
      return existing;
    }
    if (generated.length >= MAX_ROWS) throw new Error("将创建的分类过多");
    const nextOrder = parentOrder.get(parentId) ?? -1;
    const order = source?.sortOrder ?? Math.min(nextOrder + 1, 2147483647);
    parentOrder.set(parentId, Math.max(nextOrder, order));
    const row = { id: crypto.randomUUID(), parentId, name, sortOrder: order,
      visibility: opts.preserveVisibility ? source?.visibility ?? "private" : "private",
      createdAt: source?.createdAt, path };
    generated.push(row);
    // JSON uses IDs to represent distinct sibling folders even if their display names match.
    if (!source) byName.set(k, [row]);
    return row;
  }

  function ensurePath(path: string[]): Folder | undefined {
    let parent: Folder | undefined;
    for (let i = 0; i < Math.min(path.length, MAX_DEPTH); i++) {
      const prefix = path.slice(0, i + 1);
      const k = pathKey(prefix);
      const row: Folder = categoriesByPath.get(k) ?? addFolder(parent?.id ?? null, path[i], prefix);
      categoriesByPath.set(k, row);
      parent = row;
    }
    return parent;
  }

  if (opts.mapFolders) {
    for (const source of library.categories) {
      if (library.format === "json") {
        const parentId = source.parentId === null ? null : categoriesByArchiveId.get(source.parentId)!.id;
        categoriesByArchiveId.set(source.id, addFolder(parentId, source.name, source.path, source));
      } else ensurePath(source.path);
    }
  }
  const sourceCategories = new Map(library.categories.map((row) => [row.id, row]));
  const bookmarkMapping = new Map<string, string>();
  const records: (typeof bookmarks.$inferInsert & { tags: string[] })[] = [];
  const sample: ImportPreview["sample"] = [];
  const seen = new Map(oldBookmarks);
  let duplicates = 0, invalid = library.invalid;
  for (const row of library.bookmarks) {
    const url = transferUrl(row.url);
    const hash = url && hashUrl(url);
    const previous = hash ? seen.get(hash) : undefined;
    if (sample.length < 50) sample.push({ title: row.title.slice(0, 300), url: row.url.slice(0, 4096), folderPath: row.folderPath, duplicate: !!previous, invalid: !url });
    if (!url || !hash) { invalid++; continue; }
    if (previous) {
      duplicates++;
      if (row.id) bookmarkMapping.set(row.id, previous);
      continue;
    }
    const id = crypto.randomUUID();
    seen.set(hash, id);
    if (row.id) bookmarkMapping.set(row.id, id);
    const cat = !opts.mapFolders ? undefined : row.categoryId ? categoriesByArchiveId.get(row.categoryId) : ensurePath(row.folderPath);
    const originalCategory = row.categoryId ? sourceCategories.get(row.categoryId) : undefined;
    const intended = row.visibility ?? originalCategory?.visibility ?? "private";
    // Default to private, and never increase the source visibility because an existing
    // same-name category has different visibility or the admin flattened the hierarchy.
    let own = opts.preserveVisibility ? row.visibility ?? null : "private";
    if (opts.preserveVisibility && own === null && (cat?.visibility ?? "private") !== intended) own = intended;
    if (originalCategory && originalCategory.visibility !== "public" && own === "public" && cat?.visibility === "public") own = "private";
    if (originalCategory && originalCategory.visibility !== "public" && !cat && own === "public") own = "private";
    const icon = portableIcon(row.iconUrl);
    records.push({ id, categoryId: cat?.id ?? null, url, urlHash: hash,
      title: row.title.slice(0, 300) || url.slice(0, 300), description: row.description?.slice(0, 500) || null,
      altUrl: row.altUrl ? transferUrl(row.altUrl) : null, iconUrl: icon, iconSource: icon ? "manual" : "none", iconHidden: row.iconHidden ?? false,
      visibility: own, effectiveVisibility: own ?? cat?.visibility ?? "private", sortOrder: row.sortOrder ?? 0,
      createdAt: row.createdAt, tags: row.tags ?? [] });
  }
  return { generated, records, sample, duplicates, invalid, bookmarkMapping };
}

function existingLibrary() {
  const folders = db.select().from(categories).orderBy(asc(categories.sortOrder), asc(categories.createdAt)).all();
  const urls = new Map(db.select({ hash: bookmarks.urlHash, id: bookmarks.id }).from(bookmarks).all().map(({ hash, id }) => [hash, id]));
  return { folders, urls };
}

export function buildPreview(raw: string, format: TransferFormat = "html"): ImportPreview {
  const lib = parseTransfer(raw, format);
  const { folders, urls } = existingLibrary();
  const plan = prepare(lib, { mapFolders: true }, folders, urls);
  return { format, total: lib.bookmarks.length + lib.invalid, willCreate: plan.records.length,
    duplicates: plan.duplicates, invalid: plan.invalid, newFolderCount: plan.generated.length,
    newFolders: plan.generated.slice(0, 50).map(({ path }) => path.join(" / ")),
    hasSettings: !!lib.settings && Object.keys(lib.settings).length > 0, sample: plan.sample };
}

export function runImport(raw: string, opts: ImportOptions, format: TransferFormat = "html"): ImportResult {
  const lib = parseTransfer(raw, format);
  return db.transaction((tx) => {
    const { folders, urls } = existingLibrary();
    const plan = prepare(lib, opts, folders, urls);
    for (const { id, parentId, name, sortOrder, visibility, createdAt } of plan.generated) {
      tx.insert(categories).values({ id, parentId, name, sortOrder, visibility, createdAt, slug: slugify(name, id) }).run();
    }
    for (const { tags, ...record } of plan.records) {
      tx.insert(bookmarks).values(record).run();
      if (tags.length) replaceBookmarkTags(tx, record.id, tags);
    }
    let settingsAdded = 0;
    if (opts.applySettings && lib.settings) {
      const src = lib.settings;
      const ids = (src.quickToolIds ?? []).map((id) => plan.bookmarkMapping.get(id)).filter((id): id is string => !!id);
      const shortcuts = [...new Set(ids)].join(",");
      const values = { site_name: src.siteName, site_tagline: src.siteTagline, owner_name: src.ownerName, footer_text: src.footerText,
        show_icons: src.showIcons === undefined ? undefined : src.showIcons ? "1" : "0",
        quick_tool_ids: shortcuts || (src.quickToolsManual ? "[]" : undefined) };
      for (const [k, value] of Object.entries(values)) {
        if (value === undefined) continue;
        settingsAdded += tx.insert(settings).values({ key: k, value }).onConflictDoNothing().run().changes;
      }
    }
    return { created: plan.records.length, skipped: plan.duplicates, invalid: plan.invalid, foldersCreated: plan.generated.length, settingsAdded };
  });
}
