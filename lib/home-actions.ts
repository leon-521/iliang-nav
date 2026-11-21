"use server";

import { asc, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { bookmarks, categories } from "@/lib/db/schema";
import { moveRelative } from "./home-order";
import { tagsByBookmark } from "@/lib/bookmarks/tag-store";

const id = z.string().uuid();
const moveInput = z.object({ source: id, target: id, after: z.boolean() });

function refreshOrder() {
  revalidatePath("/");
  revalidatePath("/categories");
  revalidatePath("/bookmarks");
  revalidatePath("/search");
  revalidatePath("/c/[slug]", "page");
}

export async function moveHomeBookmark(input: unknown) {
  await requireAdmin();
  const result = moveInput.safeParse(input);
  if (!result.success) return { ok: false, error: "无效的排序请求。" };
  const { source, target, after } = result.data;
  const saved = db.transaction((tx) => {
    const rows = tx.select({ id: bookmarks.id, order: bookmarks.sortOrder }).from(bookmarks)
      .orderBy(asc(bookmarks.sortOrder), asc(bookmarks.createdAt), asc(bookmarks.id)).all();
    const ids = moveRelative(rows.map((row) => row.id), source, target, after);
    if (!ids) return false;
    const previous = new Map(rows.map((row) => [row.id, row.order]));
    ids.forEach((key, sortOrder) => {
      if (previous.get(key) !== sortOrder) tx.update(bookmarks).set({ sortOrder }).where(eq(bookmarks.id, key)).run();
    });
    return true;
  });
  if (!saved) return { ok: false, error: "书签已变化，请刷新后再试。" };
  refreshOrder();
  return { ok: true };
}

export async function moveHomeCategory(input: unknown) {
  await requireAdmin();
  const result = moveInput.safeParse(input);
  if (!result.success) return { ok: false, error: "无效的排序请求。" };
  const { source, target, after } = result.data;
  const saved = db.transaction((tx) => {
    const row = tx.select({ parent: categories.parentId }).from(categories).where(eq(categories.id, source)).get();
    if (!row) return false;
    const siblings = tx.select({ id: categories.id, order: categories.sortOrder }).from(categories)
      .where(row.parent ? eq(categories.parentId, row.parent) : isNull(categories.parentId))
      .orderBy(asc(categories.sortOrder), asc(categories.createdAt), asc(categories.id)).all();
    const ids = moveRelative(siblings.map((item) => item.id), source, target, after);
    if (!ids) return false;
    const previous = new Map(siblings.map((item) => [item.id, item.order]));
    ids.forEach((key, sortOrder) => {
      if (previous.get(key) !== sortOrder) tx.update(categories).set({ sortOrder }).where(eq(categories.id, key)).run();
    });
    return true;
  });
  if (!saved) return { ok: false, error: "只能在同级分类内调整顺序。" };
  refreshOrder();
  return { ok: true };
}

export async function saveCategoryWeight(categoryId: string, weight: number) {
  await requireAdmin();
  if (!id.safeParse(categoryId).success || !Number.isInteger(weight) || weight < -9999 || weight > 9999) {
    return { ok: false, error: "权重必须在 -9999 至 9999 之间。" };
  }
  const result = db.update(categories).set({ sortOrder: weight }).where(eq(categories.id, categoryId)).run();
  if (!result.changes) return { ok: false, error: "分类不存在。" };
  refreshOrder();
  return { ok: true };
}

// Retrieve editable values only after the administrator opens the edit menu.
export async function homeBookmarkEditor(bookmarkId: string) {
  await requireAdmin();
  if (!id.safeParse(bookmarkId).success) return null;
  const row = db.select({ id: bookmarks.id, title: bookmarks.title, url: bookmarks.url, altUrl: bookmarks.altUrl,
    description: bookmarks.description, categoryId: bookmarks.categoryId, iconUrl: bookmarks.iconUrl,
    visibility: bookmarks.visibility, sortOrder: bookmarks.sortOrder }).from(bookmarks).where(eq(bookmarks.id, bookmarkId)).get();
  return row ? { ...row, tags: tagsByBookmark([bookmarkId]).get(bookmarkId) ?? [] } : null;
}
