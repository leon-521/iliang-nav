import { db } from "@/lib/db";
import { bookmarks, categories } from "@/lib/db/schema";
import { parseNetscape, clampPath, type ParsedBookmark } from "./netscape";
import { normalizeUrl, hashUrl } from "./url";

export type ImportPreview = {
  total: number;
  willCreate: number;
  duplicates: number;
  invalid: number;
  newFolders: string[];
  /** 预览用的前若干条，供前端展示 */
  sample: Array<{
    title: string;
    url: string;
    folderPath: string[];
    duplicate: boolean;
    invalid: boolean;
  }>;
};

function slugify(name: string, index: number): string {
  const base = name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return base || `folder-${index}`;
}

/** 解析 + 去重 + 生成预览，不落库 */
export function buildPreview(html: string): ImportPreview {
  const parsed = parseNetscape(html);

  // 现有 url_hash 集合
  const existingHashes = new Set(
    db.select({ h: bookmarks.urlHash }).from(bookmarks).all().map((r) => r.h),
  );

  // 现有分类 slug 集合
  const existingSlugs = new Set(
    db.select({ s: categories.slug }).from(categories).all().map((r) => r.s),
  );

  const seenInFile = new Set<string>();
  let duplicates = 0;
  let invalid = parsed.invalid;

  const usable: Array<ParsedBookmark & { hash: string; normalized: string }> = [];

  // 一次遍历同时决定每条的去留，并留下逐条判定结果。
  // 之前是遍历完再用「已经吃进全部新 URL」的 seenInFile 反查 sample，
  // 结果每条新书签都被判成重复。
  const verdicts = new Map<ParsedBookmark, { duplicate: boolean; invalid: boolean }>();

  for (const b of parsed.bookmarks) {
    const normalized = normalizeUrl(b.url);
    if (!normalized) {
      invalid++;
      verdicts.set(b, { duplicate: false, invalid: true });
      continue;
    }
    const hash = hashUrl(normalized);

    if (existingHashes.has(hash) || seenInFile.has(hash)) {
      duplicates++;
      verdicts.set(b, { duplicate: true, invalid: false });
      continue;
    }
    seenInFile.add(hash);
    verdicts.set(b, { duplicate: false, invalid: false });
    usable.push({ ...b, hash, normalized });
  }

  // 需要新建的文件夹（按 3 级裁剪后去重）
  const newFolders: string[] = [];
  const plannedSlugs = new Set(existingSlugs);
  for (const b of usable) {
    const path = clampPath(b.folderPath.filter(Boolean));
    for (let i = 0; i < path.length; i++) {
      const sub = path.slice(0, i + 1);
      const name = sub[sub.length - 1];
      const slug = slugify(name, i);
      if (!plannedSlugs.has(slug)) {
        plannedSlugs.add(slug);
        newFolders.push(sub.join(" / "));
      }
    }
  }

  return {
    total: parsed.bookmarks.length + parsed.invalid,
    willCreate: usable.length,
    duplicates,
    invalid,
    newFolders,
    sample: parsed.bookmarks.slice(0, 50).map((b) => {
      const v = verdicts.get(b) ?? { duplicate: false, invalid: true };
      return {
        title: b.title,
        url: b.url,
        folderPath: b.folderPath,
        duplicate: v.duplicate,
        invalid: v.invalid,
      };
    }),
  };
}

export type ImportOptions = {
  /** true：文件夹映射为分类；false：全部进未分类 */
  mapFolders: boolean;
  /** 只导入 sample 中选中的 url（可选） */
  onlyUrls?: string[];
};

export type ImportResult = {
  created: number;
  skipped: number;
  invalid: number;
  foldersCreated: number;
};

/** 真正落库：单事务，失败整体回滚 */
export function runImport(html: string, opts: ImportOptions): ImportResult {
  const parsed = parseNetscape(html);
  const existingHashes = new Set(
    db.select({ h: bookmarks.urlHash }).from(bookmarks).all().map((r) => r.h),
  );

  const only = opts.onlyUrls ? new Set(opts.onlyUrls) : null;

  // 分类缓存：path.join("/") -> id
  const catByPath = new Map<string, string>();
  for (const c of db.select().from(categories).all()) {
    catByPath.set(`${c.parentId ?? ""}\u0000${c.name}`, c.id);
  }

  let foldersCreated = 0;
  let created = 0;
  let skipped = 0;
  let invalid = parsed.invalid;
  const seen = new Set<string>();

  const ensureCategory = (path: string[]): string | null => {
    if (!opts.mapFolders || path.length === 0) return null;

    let parentId: string | null = null;
    for (const name of clampPath(path)) {
      const key = `${parentId ?? ""}\u0000${name}`;
      let id = catByPath.get(key);
      if (!id) {
        id = crypto.randomUUID();
        db.insert(categories)
          .values({
            id,
            parentId,
            name,
            slug: `${slugify(name, 0)}-${id.slice(0, 6)}`,
            sortOrder: 0,
            visibility: "private",
          })
          .run();
        catByPath.set(key, id);
        foldersCreated++;
      }
      parentId = id;
    }
    return parentId;
  };

  db.transaction(() => {
    for (const b of parsed.bookmarks) {
      if (only && !only.has(b.url)) continue;

      const normalized = normalizeUrl(b.url);
      if (!normalized) {
        invalid++;
        continue;
      }
      const hash = hashUrl(normalized);

      if (existingHashes.has(hash) || seen.has(hash)) {
        skipped++;
        continue;
      }
      seen.add(hash);

      const categoryId = ensureCategory(b.folderPath.filter(Boolean));

      db.insert(bookmarks)
        .values({
          id: crypto.randomUUID(),
          categoryId,
          url: normalized,
          urlHash: hash,
          title: b.title.slice(0, 300),
          description: b.description?.slice(0, 500) ?? null,
          iconSource: "none",
          visibility: null,
          // 写时展开：未显式设置则继承分类；未分类默认 private（导入后自己确认再公开）
          effectiveVisibility: "private",
          sortOrder: 0,
          createdAt: b.addDate ? Math.floor(b.addDate) : Math.floor(Date.now() / 1000),
        })
        .run();
      created++;
    }
  });

  return { created, skipped, invalid, foldersCreated };
}
