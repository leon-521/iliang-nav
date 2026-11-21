import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookmarks, categories } from "@/lib/db/schema";
import { getViewer, type Viewer } from "@/lib/auth/session";
import { tagsByBookmark } from "@/lib/bookmarks/tag-store";
import { visibleWhere } from "@/lib/visibility";
import { getSettings, type SiteSettings } from "@/lib/settings/service";

/**
 * 前台视图模型。
 *
 * 页面组件不直接查库（见项目约束），统一从这里取；
 * 可见性只走 lib/visibility.ts 的 visibleWhere，不另写一套判断。
 *
 * 注意：viewer 一律显式传参，不用模块级缓存。
 * 服务端同一进程要处理并发请求，缓存 viewer 会让 A 请求读到 B 的身份，
 * 那是把管理员视图泄漏给匿名访客的真实风险。
 */

export type PublicBookmark = {
  id: string;
  title: string;
  url: string;
  /** 备用链接：主站打不开时的第二入口，可为空 */
  altUrl: string | null;
  description: string | null;
  categoryId: string | null;
  iconUrl: string | null;
  iconHidden: boolean;
  clickCount: number;
  createdAt: number;
  sortOrder: number;
  tags: string[];
};

export type PublicCategory = {
  id: string;
  name: string;
  /** 公开分类页的路由片段：/c/<slug> */
  slug: string;
  parentId: string | null;
  /** 含全部后代分类的书签数 */
  count: number;
  /** 只算直接挂在本分类下的书签数 */
  directCount: number;
  /** 直接子分类个数，侧栏用来决定要不要显示「有下级」 */
  childCount: number;
  sortOrder: number;
};

export type PublicGroup = {
  id: string;
  name: string;
  /** 分类页路由片段；未分类分组没有（id 是 "__uncat__"） */
  slug?: string;
  items: Array<{ bookmark: PublicBookmark; subName?: string }>;
};

export type PublicView = {
  settings: SiteSettings;
  isAdmin: boolean;
  total: number;
  categoryCount: number;
  categories: PublicCategory[];
  groups: PublicGroup[];
  quickTools: PublicBookmark[];
  /**
   * 拍平后的分类列表（带缩进深度），给前台弹窗的下拉框用。
   * 与 categories 的区别：那个是按分组统计计数的展示用结构，
   * 这个只关心「id + 名字 + 层级」，直接喂给 select。
   */
  categoryOptions: CategoryOption[];
};

export type CategoryOption = { id: string; name: string; depth: number };

/** 分类页要展示的一级子分类入口 */
export type PublicSubCategory = {
  id: string;
  name: string;
  slug: string;
  /** 含后代 */
  count: number;
  directCount: number;
  childCount: number;
};

/** 把分类树按父子顺序拍平，depth 用于下拉框缩进 */
function flattenCategories(
  rows: Array<{ id: string; name: string; parentId: string | null }>,
): CategoryOption[] {
  const byParent = new Map<string | null, typeof rows>();
  for (const r of rows) {
    const k = r.parentId ?? null;
    if (!byParent.has(k)) byParent.set(k, []);
    byParent.get(k)!.push(r);
  }

  const out: CategoryOption[] = [];
  const seen = new Set<string>();
  const walk = (parentId: string | null, depth: number) => {
    for (const r of byParent.get(parentId) ?? []) {
      if (seen.has(r.id)) continue; // 防御脏数据里的环
      seen.add(r.id);
      out.push({ id: r.id, name: r.name, depth });
      walk(r.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

const BOOKMARK_COLUMNS = {
  id: bookmarks.id,
  title: bookmarks.title,
  url: bookmarks.url,
  altUrl: bookmarks.altUrl,
  description: bookmarks.description,
  categoryId: bookmarks.categoryId,
  iconUrl: bookmarks.iconUrl,
  iconHidden: bookmarks.iconHidden,
  clickCount: bookmarks.clickCount,
  createdAt: bookmarks.createdAt,
  sortOrder: bookmarks.sortOrder,
};

/** 当前可见书签，已按 sortOrder 排序 */
export function listVisibleBookmarks(viewer: Viewer): PublicBookmark[] {
  const rows = db
    .select(BOOKMARK_COLUMNS)
    .from(bookmarks)
    .leftJoin(categories, eq(bookmarks.categoryId, categories.id))
    .where(visibleWhere(viewer))
    .orderBy(asc(bookmarks.sortOrder), asc(bookmarks.createdAt))
    .all();
  const labels = tagsByBookmark(rows.map((row) => row.id));
  return rows.map((row) => ({ ...row, tags: labels.get(row.id) ?? [] }));
}

/**
 * 只按顶层分类分组，子分类并入祖先，卡片上用标签标出子分类名。
 * 避免子分类被渲染成并列的大区块。
 */
export function buildGroups(
  cats: Array<{
    id: string;
    name: string;
    slug: string;
    parentId: string | null;
  }>,
  items: PublicBookmark[],
): PublicGroup[] {
  const byId = new Map(cats.map((c) => [c.id, c]));

  const rootOf = (id: string | null): string | null => {
    let cur = id;
    let guard = 0;
    while (cur && guard++ < 10) {
      const c = byId.get(cur);
      if (!c) return cur;
      if (!c.parentId) return c.id;
      cur = c.parentId;
    }
    return cur;
  };

  const buckets = new Map<string, PublicGroup>();
  for (const c of cats.filter((c) => !c.parentId)) {
    buckets.set(c.id, { id: c.id, name: c.name, slug: c.slug, items: [] });
  }

  for (const b of items) {
    const rootId = rootOf(b.categoryId);

    if (!rootId) {
      if (!buckets.has("__uncat__")) {
        buckets.set("__uncat__", { id: "__uncat__", name: "未分类", items: [] });
      }
      buckets.get("__uncat__")!.items.push({ bookmark: b });
      continue;
    }

    if (!buckets.has(rootId)) {
      const rootCat = byId.get(rootId);
      buckets.set(rootId, {
        id: rootId,
        name: rootCat?.name ?? "未分类",
        slug: rootCat?.slug,
        items: [],
      });
    }

    const isChild = b.categoryId !== rootId;
    buckets.get(rootId)!.items.push({
      bookmark: b,
      subName: isChild ? byId.get(b.categoryId ?? "")?.name : undefined,
    });
  }

  return [...buckets.values()].filter((g) => g.items.length > 0);
}

/** 首页/搜索页共用视图 */
export async function getPublicView(): Promise<PublicView> {
  const viewer = await getViewer();
  const settings = getSettings();
  const items = listVisibleBookmarks(viewer);

  // 管理员看全部分类；访客只看 public —— 与 visibleWhere 的口径保持一致
  const catRows =
    viewer.kind === "admin"
      ? db.select().from(categories).orderBy(asc(categories.sortOrder)).all()
      : db
          .select()
          .from(categories)
          .where(eq(categories.visibility, "public"))
          .orderBy(asc(categories.sortOrder))
          .all();

  const groups = buildGroups(catRows, items);

  const counts = countByCategory(catRows, items);
  const childCount = new Map<string | null, number>();
  for (const c of catRows) {
    const k = c.parentId ?? null;
    childCount.set(k, (childCount.get(k) ?? 0) + 1);
  }

  // 侧栏数字用 total（含子分类），否则父分类显示 0、子分类里却有一堆
  const cats: PublicCategory[] = catRows.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    parentId: c.parentId,
    count: counts.get(c.id)?.total ?? 0,
    directCount: counts.get(c.id)?.direct ?? 0,
    childCount: childCount.get(c.id) ?? 0,
    sortOrder: c.sortOrder,
  }));

  const quickTools = pickQuickTools(items, settings.quickToolIds, settings.quickToolsManual);

  return {
    settings,
    isAdmin: viewer.kind === "admin",
    total: items.length,
    categoryCount: groups.length,
    categories: cats,
    groups,
    quickTools,
    categoryOptions: flattenCategories(catRows),
  };
}

/**
 * 常用工具的取法：
 *  - 后台配了清单 → 按配置顺序取（配置里已下架/隐藏的书签自动跳过）
 *  - 没配 → 退回「点击最多的前 8 个」，保持旧行为
 *
 * 只从 items 里挑，所以可见性过滤天然生效：
 * 管理员配了某个私有书签，访客也看不到。
 */
export function pickQuickTools(
  items: PublicBookmark[],
  configuredIds: string[],
  manual = configuredIds.length > 0,
): PublicBookmark[] {
  if (manual) {
    const byId = new Map(items.map((b) => [b.id, b]));
    const picked = configuredIds
      .map((id) => byId.get(id))
      .filter((b): b is PublicBookmark => Boolean(b));
    return picked.slice(0, 12);
  }

  return [...items].sort((a, b) => b.clickCount - a.clickCount).slice(0, 8);
}

/** 收集某分类及其所有后代的 id（分类页要连子分类一起展示） */
function collectDescendants(
  cats: Array<{ id: string; parentId: string | null }>,
  rootId: string,
): Set<string> {
  const childrenOf = new Map<string | null, string[]>();
  for (const c of cats) {
    const k = c.parentId ?? null;
    if (!childrenOf.has(k)) childrenOf.set(k, []);
    childrenOf.get(k)!.push(c.id);
  }

  const out = new Set<string>();
  const walk = (id: string) => {
    if (out.has(id)) return; // 防御脏数据里的环
    out.add(id);
    for (const child of childrenOf.get(id) ?? []) walk(child);
  };
  walk(rootId);
  return out;
}

/**
 * 每个分类的两套计数。
 *
 * direct —— 直接挂在这个分类下的书签数
 * total  —— 含所有后代分类的书签数
 *
 * 为什么两套都要：分类页要显示「本级 N 个 / 含子分类 M 个」，
 * 侧栏要显示 M（否则父分类显示 0、子分类里却有一堆，看起来像数据丢了）。
 * 一次遍历算完，别对每个分类都扫一遍 items。
 */
function countByCategory(
  cats: Array<{ id: string; parentId: string | null }>,
  items: PublicBookmark[],
): Map<string, { direct: number; total: number }> {
  const parentOf = new Map(cats.map((c) => [c.id, c.parentId ?? null]));
  const out = new Map<string, { direct: number; total: number }>();
  for (const c of cats) out.set(c.id, { direct: 0, total: 0 });

  for (const b of items) {
    if (!b.categoryId) continue;
    const own = out.get(b.categoryId);
    if (own) own.direct += 1;

    // 往祖先方向累加，带环保护
    let cur = parentOf.get(b.categoryId) ?? null;
    let guard = 0;
    while (cur && guard++ < 50) {
      const rec = out.get(cur);
      if (rec) rec.total += 1;
      cur = parentOf.get(cur) ?? null;
    }
  }

  // 自己的直接数也算进 total
  for (const [, rec] of out) rec.total += rec.direct;
  return out;
}

/**
 * 单个分类页的视图。
 *
 * 只认 slug 而不认 id：id 是 uuid，放进 URL 又长又没法读。
 * 分类不存在、或访客访问了非公开分类，都返回 null 让页面走 404 ——
 * 不要「有分类但列表为空」，那会暴露私有分类的名字。
 */
export async function getCategoryView(slug: string) {
  const viewer = await getViewer();
  const settings = getSettings();

  const allCats =
    viewer.kind === "admin"
      ? db.select().from(categories).orderBy(asc(categories.sortOrder)).all()
      : db
          .select()
          .from(categories)
          .where(eq(categories.visibility, "public"))
          .orderBy(asc(categories.sortOrder))
          .all();

  const current = allCats.find((c) => c.slug === slug);
  if (!current) return null;

  const items = listVisibleBookmarks(viewer);
  const ids = collectDescendants(allCats, current.id);
  const inCategory = items.filter((b) => b.categoryId && ids.has(b.categoryId));

  /*
   * 本级书签与子树书签分开。
   *
   * 之前把整棵子树的书签摊平在一个列表里：顶层分类一旦有子分类，
   * 页面上就是几十条混在一起的卡片，除了每张小卡上那个小标签，
   * 没有任何办法看出哪些属于哪个子分类 —— 这正是「乱」的来源。
   * 现在默认只列本级书签，子分类单独给入口。
   */
  const directEntries = inCategory
    .filter((b) => b.categoryId === current.id)
    .map((bookmark) => ({ bookmark }));

  // 子分类名要标在每条上，否则子分类的书签混在一起分不清来源
  const nameById = new Map(allCats.map((c) => [c.id, c.name]));
  const subtreeEntries = inCategory.map((bookmark) => ({
    bookmark,
    subName:
      bookmark.categoryId && bookmark.categoryId !== current.id
        ? nameById.get(bookmark.categoryId)
        : undefined,
  }));

  const counts = countByCategory(allCats, items);
  const childCount = new Map<string | null, number>();
  for (const c of allCats) {
    const k = c.parentId ?? null;
    childCount.set(k, (childCount.get(k) ?? 0) + 1);
  }

  /** 直接子分类，按 sortOrder（allCats 已排过序，filter 保持原序） */
  const children: PublicSubCategory[] = allCats
    .filter((c) => c.parentId === current.id)
    .map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      count: counts.get(c.id)?.total ?? 0,
      directCount: counts.get(c.id)?.direct ?? 0,
      childCount: childCount.get(c.id) ?? 0,
    }));

  /** 祖先链（用于面包屑），从根到父，不含自己 */
  const byId = new Map(allCats.map((c) => [c.id, c]));
  const ancestors: Array<{ name: string; slug: string }> = [];
  {
    let cur = current.parentId;
    let guard = 0;
    while (cur && guard++ < 50) {
      const c = byId.get(cur);
      if (!c) break;
      ancestors.unshift({ name: c.name, slug: c.slug });
      cur = c.parentId;
    }
  }

  const groups = buildGroups(allCats, items);
  const cats: PublicCategory[] = allCats.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    parentId: c.parentId,
    count: counts.get(c.id)?.total ?? 0,
    directCount: counts.get(c.id)?.direct ?? 0,
    childCount: childCount.get(c.id) ?? 0,
    sortOrder: c.sortOrder,
  }));

  return {
    settings,
    isAdmin: viewer.kind === "admin",
    total: items.length,
    categoryCount: groups.length,
    categories: cats,
    groups,
    quickTools: pickQuickTools(items, settings.quickToolIds, settings.quickToolsManual),
    categoryOptions: flattenCategories(allCats),
    category: {
      id: current.id,
      name: current.name,
      slug: current.slug,
      parentId: current.parentId,
    },
    /** 直接挂在本分类下的书签（默认展示这些） */
    entries: directEntries,
    /** 含所有后代分类的书签，供「查看全部」用 */
    subtreeEntries,
    children,
    ancestors,
  };
}

/** 搜索：先用 FTS 拿到命中 id，再回到同一份分组数据里过滤，保证口径一致 */
export async function getSearchView(rawQuery: string) {
  const base = await getPublicView();
  const q = rawQuery.trim();

  if (!q) return { ...base, hits: [] as PublicBookmark[] };

  const viewer = await getViewer();
  const { searchBookmarks } = await import("@/lib/search");
  const hitIds = new Set(searchBookmarks(q, viewer, 200).map((r) => r.id));

  const hits = base.groups
    .flatMap((g) => g.items.map((i) => i.bookmark))
    .filter((b) => hitIds.has(b.id));

  return { ...base, hits };
}

/** 点书签 +1：原子自增，失败不影响跳转 */
export function bumpClick(id: string) {
  try {
    db.update(bookmarks)
      .set({ clickCount: sql`${bookmarks.clickCount} + 1` })
      .where(eq(bookmarks.id, id))
      .run();
  } catch {
    // 统计失败不该挡住用户访问网站
  }
}
