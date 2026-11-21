"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { bookmarks, categories } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { normalizeUrl, hashUrl } from "@/lib/import/url";
import {
  fetchPageMetadata,
  fetchIconFallback,
  MetadataError,
} from "@/lib/metadata/fetch";
import { localizeIcon } from "@/lib/metadata/icons";
import { parseBookmarkTags } from "./tags";
import { replaceBookmarkTags } from "./tag-store";

const Visibility = z.enum(["private", "unlisted", "public"]);

const BookmarkInput = z.object({
  url: z.string().min(1, "URL 必填"),
  /**
   * 备用链接。主站打不开时用的第二个入口，可以为空。
   * 上限比主 URL 宽松一点（有些镜像站地址带长签名参数）。
   */
  altUrl: z.string().max(2000).optional(),
  title: z.string().max(300).optional(),
  description: z.string().max(500).optional(),
  iconUrl: z.string().max(2000).optional(),
  categoryId: z.string().uuid().nullable().optional(),
  /**
   * null 表示「继承分类」。
   * 表单里「继承」这个选项提交的是空字符串，这里统一换成 null，
   * 否则 "" 过不了 enum 校验，编辑时会报「参数错误」。
   */
  visibility: Visibility.nullable().optional(),
  /**
   * 首页展示顺序：数字小的排前面，同值再按创建时间。
   * 公开页查询本来就是 `order by sort_order, created_at`，
   * 让它可改就等于「用排序值决定首页位置」。
   */
  sortOrder: z.number().int().min(-9999).max(9999).optional(),
});

export type ActionResult = { ok: boolean; error?: string; id?: string };

export type MetadataPreview = {
  ok: boolean;
  error?: string;
  title?: string | null;
  description?: string | null;
  iconUrl?: string | null;
  finalUrl?: string;
};

/**
 * 表单里点「识别」时调用：抓标题、描述、图标。
 * 失败不抛错，返回 ok:false 让前端提示，别把整个对话框搞崩。
 */
export async function previewMetadata(rawUrl: string): Promise<MetadataPreview> {
  await requireAdmin();

  const trimmed = rawUrl?.trim();
  if (!trimmed) return { ok: false, error: "先填网址" };

  try {
    const m = await fetchPageMetadata(trimmed);
    return {
      ok: true,
      title: m.title,
      description: m.description,
      iconUrl: m.iconUrl,
      finalUrl: m.finalUrl,
    };
  } catch (e) {
    /*
     * 页面抓不到（403 / 反爬 / 超时）时，退一步只补图标。
     * 这类站点的 HTML 一个字都不给，但第三方图标服务基本都能拿到，
     * 比让用户自己去找图标地址强得多。
     */
    const iconUrl = await fetchIconFallback(trimmed);
    if (iconUrl) {
      return {
        ok: true,
        title: null,
        description: null,
        iconUrl,
        finalUrl: trimmed,
        error: "站点拒绝抓取，只补到了图标",
      };
    }

    const msg =
      e instanceof MetadataError
        ? e.message
        : e instanceof Error && e.name === "TimeoutError"
          ? "请求超时"
          : "无法识别，站点可能禁止抓取";
    return { ok: false, error: msg };
  }
}

/** 计算 effective_visibility：显式值 ?? 分类默认值 ?? private */
/**
 * 表单里的排序值是字符串：空串 / 非数字都当「没填」。
 * 不能直接 Number() —— 空串会变成 0，等于把排序悄悄重置了。
 */
function parseSortOrder(raw: FormDataEntryValue | null): number | undefined {
  if (typeof raw !== "string") return undefined;
  const t = raw.trim();
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
}

function resolveVisibility(
  explicit: string | null | undefined,
  categoryId: string | null | undefined,
): string {
  if (explicit) return explicit;
  if (categoryId) {
    const cat = db
      .select({ v: categories.visibility })
      .from(categories)
      .where(eq(categories.id, categoryId))
      .get();
    if (cat) return cat.v;
  }
  return "private";
}

/** Absent input leaves associations alone; an explicitly empty field clears them. */
function readSubmittedTags(formData: FormData): { tags?: string[]; error?: string } {
  const raw = formData.get("tags");
  if (raw === null) return {};
  if (typeof raw !== "string") return { error: "标签格式不正确" };
  return parseBookmarkTags(raw);
}

export async function createBookmark(formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const submittedTags = readSubmittedTags(formData);
  if (submittedTags.error) return { ok: false, error: submittedTags.error };

  const parsed = BookmarkInput.safeParse({
    url: formData.get("url"),
    altUrl: formData.get("altUrl") || undefined,
    title: formData.get("title") || undefined,
    description: formData.get("description") || undefined,
    iconUrl: formData.get("iconUrl") || undefined,
    categoryId: formData.get("categoryId") || null,
    visibility: formData.get("visibility") || undefined,
    sortOrder: parseSortOrder(formData.get("sortOrder")),
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "参数错误" };
  }

  const normalized = normalizeUrl(parsed.data.url);
  if (!normalized) return { ok: false, error: "不是合法的 http/https 地址" };

  const hash = hashUrl(normalized);
  const dup = db
    .select({ id: bookmarks.id })
    .from(bookmarks)
    .where(eq(bookmarks.urlHash, hash))
    .get();
  if (dup) return { ok: false, error: "这个网址已经存在了" };

  /*
   * 自动识别：表单没带标题/图标时，服务端自己抓一次。
   * 失败就算了 —— 抓不到不该让「添加书签」失败，域名兜底照样能用。
   */
  let title = parsed.data.title;
  let description = parsed.data.description;
  let iconUrl = parsed.data.iconUrl;

  if (!title || !iconUrl) {
    try {
      const m = await fetchPageMetadata(normalized);
      if (!title && m.title) title = m.title;
      if (!description && m.description) description = m.description;
      if (!iconUrl && m.iconUrl) iconUrl = m.iconUrl;
    } catch {
      /*
       * 静默降级，但至少把图标补上。
       * 403 的站点（npmjs、知乎这类）页面抓不到，图标却基本都能拿到，
       * 少了这一步列表里就是一片灰方块。
       */
      if (!iconUrl) {
        const fallback = await fetchIconFallback(normalized);
        if (fallback) iconUrl = fallback;
      }
    }
  }

  const id = crypto.randomUUID();
  const categoryId = parsed.data.categoryId ?? null;

  /*
   * 备用链接也要规范化：用户可能贴进来一个不带协议头的地址。
   * 规范化失败就当没填 —— 备用链接是锦上添花，
   * 不该因为它格式不对就把整条书签拦下来。
   */
  const altUrl = parsed.data.altUrl
    ? normalizeUrl(parsed.data.altUrl)
    : null;

  /*
   * 图标落地到本地再入库。
   *
   * 只存远程 URL 的代价：对方换图或站点挂掉，列表里就是灰方块，
   * 而且永远自愈不了；每次打开首页还要向几十个第三方域名发请求。
   * 抓不下来就退回远程地址 —— 有总比没有强，至少还能显示。
   */
  const storedIcon = await localizeIcon(iconUrl);
  if (storedIcon) iconUrl = storedIcon;

  db.transaction((tx) => {
    tx.insert(bookmarks)
      .values({
        id,
        categoryId,
        url: normalized,
        urlHash: hash,
        altUrl: altUrl && altUrl !== normalized ? altUrl : null,
        title: (title ?? normalized).slice(0, 300),
        description: description ?? null,
        iconUrl: iconUrl ?? null,
        iconSource: storedIcon ? "fetched" : iconUrl ? "fetched" : "none",
        visibility: parsed.data.visibility ?? null,
        effectiveVisibility: resolveVisibility(parsed.data.visibility, categoryId),
        sortOrder: parsed.data.sortOrder ?? 0,
      })
      .run();
    if (submittedTags.tags !== undefined) replaceBookmarkTags(tx, id, submittedTags.tags);
  });

  revalidatePath("/");
  revalidatePath("/bookmarks");
  revalidatePath("/search");
  revalidatePath("/c/[slug]", "page");
  return { ok: true, id };
}

export async function updateBookmark(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();

  const current = db.select().from(bookmarks).where(eq(bookmarks.id, id)).get();
  if (!current) return { ok: false, error: "书签不存在" };

  const submittedTags = readSubmittedTags(formData);
  if (submittedTags.error) return { ok: false, error: submittedTags.error };

  const parsed = BookmarkInput.partial().safeParse({
    url: formData.get("url") ?? undefined,
    altUrl: formData.has("altUrl")
      ? (formData.get("altUrl") as string) || undefined
      : undefined,
    title: formData.get("title") ?? undefined,
    description: formData.get("description") ?? undefined,
    iconUrl: formData.get("iconUrl") ?? undefined,
    categoryId: formData.has("categoryId")
      ? (formData.get("categoryId") as string) || null
      : undefined,
    // 空字符串 = 表单里的「继承分类」，要显式变成 null，不能原样送去校验
    visibility: formData.has("visibility")
      ? (formData.get("visibility") as string) || null
      : undefined,
    sortOrder: parseSortOrder(formData.get("sortOrder")),
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "参数错误" };
  }

  let url = current.url;
  let hash = current.urlHash;
  if (parsed.data.url && parsed.data.url !== current.url) {
    const normalized = normalizeUrl(parsed.data.url);
    if (!normalized) return { ok: false, error: "不是合法的 http/https 地址" };
    const h = hashUrl(normalized);
    const dup = db
      .select({ id: bookmarks.id })
      .from(bookmarks)
      .where(and(eq(bookmarks.urlHash, h), eq(bookmarks.id, id)))
      .get();
    if (!dup) {
      const other = db
        .select({ id: bookmarks.id })
        .from(bookmarks)
        .where(eq(bookmarks.urlHash, h))
        .get();
      if (other) return { ok: false, error: "这个网址已经存在了" };
    }
    url = normalized;
    hash = h;
  }

  const categoryId =
    parsed.data.categoryId === undefined
      ? current.categoryId
      : parsed.data.categoryId;

  const visibility =
    parsed.data.visibility === undefined
      ? current.visibility
      : parsed.data.visibility;

  /*
   * 手动改过图标时也落地到本地。
   * iconSource 仍然是 manual —— 那是「谁选的」，跟「存在哪」是两件事。
   */
  let nextIconUrl =
    parsed.data.iconUrl === undefined
      ? current.iconUrl
      : parsed.data.iconUrl || null;
  if (parsed.data.iconUrl) {
    const localized = await localizeIcon(parsed.data.iconUrl);
    if (localized) nextIconUrl = localized;
  }

  db.transaction((tx) => {
    tx.update(bookmarks)
      .set({
        url,
        urlHash: hash,
        altUrl: parsed.data.altUrl === undefined
          ? current.altUrl
          : normalizeUrl(parsed.data.altUrl) ?? null,
        title: parsed.data.title?.slice(0, 300) ?? current.title,
        description:
          parsed.data.description === undefined
            ? current.description
            : parsed.data.description || null,
        iconUrl: nextIconUrl,
        iconSource:
          parsed.data.iconUrl === undefined
            ? current.iconSource
            : parsed.data.iconUrl
              ? "manual"
              : "none",
        categoryId,
        visibility,
        effectiveVisibility: resolveVisibility(visibility, categoryId),
        sortOrder:
          parsed.data.sortOrder === undefined
            ? current.sortOrder
            : parsed.data.sortOrder,
        updatedAt: Math.floor(Date.now() / 1000),
      })
      .where(eq(bookmarks.id, id))
      .run();
    if (submittedTags.tags !== undefined) replaceBookmarkTags(tx, id, submittedTags.tags);
  });

  revalidatePath("/");
  revalidatePath("/bookmarks");
  revalidatePath("/search");
  revalidatePath("/c/[slug]", "page");
  return { ok: true, id };
}

export async function setVisibility(
  id: string,
  visibility: "private" | "unlisted" | "public",
): Promise<ActionResult> {
  await requireAdmin();
  const row = db.select().from(bookmarks).where(eq(bookmarks.id, id)).get();
  if (!row) return { ok: false, error: "书签不存在" };

  db.update(bookmarks)
    .set({
      visibility,
      effectiveVisibility: resolveVisibility(visibility, row.categoryId),
      updatedAt: Math.floor(Date.now() / 1000),
    })
    .where(eq(bookmarks.id, id))
    .run();

  revalidatePath("/");
  revalidatePath("/bookmarks");
  return { ok: true };
}

export async function deleteBookmarks(ids: string[]): Promise<ActionResult> {
  await requireAdmin();
  if (ids.length === 0) return { ok: false, error: "没有选中项" };
  db.delete(bookmarks).where(inArray(bookmarks.id, ids)).run();
  revalidatePath("/");
  revalidatePath("/bookmarks");
  return { ok: true };
}

export async function bulkVisibility(
  ids: string[],
  visibility: "private" | "unlisted" | "public",
): Promise<ActionResult> {
  await requireAdmin();
  if (ids.length === 0) return { ok: false, error: "没有选中项" };

  for (const id of ids) {
    const row = db.select().from(bookmarks).where(eq(bookmarks.id, id)).get();
    if (!row) continue;
    db.update(bookmarks)
      .set({
        visibility,
        effectiveVisibility: resolveVisibility(visibility, row.categoryId),
        updatedAt: Math.floor(Date.now() / 1000),
      })
      .where(eq(bookmarks.id, id))
      .run();
  }

  revalidatePath("/");
  revalidatePath("/bookmarks");
  return { ok: true };
}

export async function bulkMove(
  ids: string[],
  categoryId: string | null,
): Promise<ActionResult> {
  await requireAdmin();
  if (ids.length === 0) return { ok: false, error: "没有选中项" };

  db.update(bookmarks)
    .set({ categoryId, updatedAt: Math.floor(Date.now() / 1000) })
    .where(inArray(bookmarks.id, ids))
    .run();

  // 分类变了，继承的可见性要重算
  for (const id of ids) {
    const row = db.select().from(bookmarks).where(eq(bookmarks.id, id)).get();
    if (!row) continue;
    db.update(bookmarks)
      .set({ effectiveVisibility: resolveVisibility(row.visibility, categoryId) })
      .where(eq(bookmarks.id, id))
      .run();
  }

  revalidatePath("/");
  revalidatePath("/bookmarks");
  return { ok: true };
}
