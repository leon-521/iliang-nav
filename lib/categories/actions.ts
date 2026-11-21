"use server";

import { revalidatePath } from "next/cache";
import { asc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { bookmarks, categories } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import type { ActionResult } from "@/lib/bookmarks/actions";
import { applyDeleteCategory } from "./ops";

const Visibility = z.enum(["private", "unlisted", "public"]);

const CategoryInput = z.object({
  name: z.string().min(1, "名称必填").max(60),
  parentId: z.string().uuid().nullable().optional(),
  visibility: Visibility.optional(),
});

function slugify(name: string, id: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return `${base || "cat"}-${id.slice(0, 6)}`;
}

/**
 * 新分类排到同级末尾。
 *
 * 之前一律写 0，一旦用户手动排过序（值变成 0..n-1），
 * 新建的分类会插到最前面，看起来像「排序没生效」。
 */
function nextSortOrder(parentId: string | null): number {
  const row = db
    .select({ max: sql<number>`coalesce(max(${categories.sortOrder}), -1)` })
    .from(categories)
    .where(
      parentId
        ? eq(categories.parentId, parentId)
        : isNull(categories.parentId),
    )
    .get();
  return Number(row?.max ?? -1) + 1;
}

export async function createCategory(formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const parsed = CategoryInput.safeParse({
    name: formData.get("name"),
    parentId: (formData.get("parentId") as string) || null,
    visibility: formData.get("visibility") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "参数错误" };
  }

  const id = crypto.randomUUID();
  db.insert(categories)
    .values({
      id,
      parentId: parsed.data.parentId ?? null,
      name: parsed.data.name,
      slug: slugify(parsed.data.name, id),
      sortOrder: nextSortOrder(parsed.data.parentId ?? null),
      visibility: parsed.data.visibility ?? "private",
    })
    .run();

  revalidatePath("/categories");
  revalidatePath("/");
  return { ok: true, id };
}

export async function renameCategory(
  id: string,
  name: string,
): Promise<ActionResult> {
  await requireAdmin();
  if (!name.trim()) return { ok: false, error: "名称不能为空" };

  db.update(categories)
    .set({ name: name.trim().slice(0, 60) })
    .where(eq(categories.id, id))
    .run();

  revalidatePath("/categories");
  revalidatePath("/");
  return { ok: true };
}

export async function setCategoryVisibility(
  id: string,
  visibility: "private" | "unlisted" | "public",
): Promise<ActionResult> {
  await requireAdmin();

  db.update(categories)
    .set({ visibility })
    .where(eq(categories.id, id))
    .run();

  // 级联：该分类下「未显式设置可见性」的书签，重新展开 effective_visibility
  const children = db
    .select({ id: bookmarks.id, visibility: bookmarks.visibility })
    .from(bookmarks)
    .where(eq(bookmarks.categoryId, id))
    .all();

  for (const b of children) {
    if (b.visibility) continue; // 显式设置的不动
    db.update(bookmarks)
      .set({ effectiveVisibility: visibility })
      .where(eq(bookmarks.id, b.id))
      .run();
  }

  revalidatePath("/categories");
  revalidatePath("/");
  return { ok: true };
}

export async function moveCategory(
  id: string,
  parentId: string | null,
): Promise<ActionResult> {
  await requireAdmin();
  if (id === parentId) return { ok: false, error: "不能把自己设为自己的父级" };

  // 防止把父级挂到自己子孙下形成环
  let cursor = parentId;
  while (cursor) {
    if (cursor === id) return { ok: false, error: "不能移动到自己的子分类下" };
    const row = db
      .select({ p: categories.parentId })
      .from(categories)
      .where(eq(categories.id, cursor))
      .get();
    cursor = row?.p ?? null;
  }

  db.update(categories).set({ parentId }).where(eq(categories.id, id)).run();
  revalidatePath("/categories");
  revalidatePath("/");
  return { ok: true };
}

/**
 * 同级内上移 / 下移。
 *
 * 不能只交换两条记录的 sort_order —— 生产上绝大多数分类的
 * sort_order 都是 0（新建和导入都写 0），交换 0 和 0 等于没动。
 * 所以先把同级重新编号成 0..n-1，再交换目标位置，保证顺序一定变化。
 */
export async function reorderCategory(
  id: string,
  direction: "up" | "down",
): Promise<ActionResult> {
  await requireAdmin();

  const self = db.select().from(categories).where(eq(categories.id, id)).get();
  if (!self) return { ok: false, error: "分类不存在" };

  const siblings = db
    .select()
    .from(categories)
    .where(
      self.parentId
        ? eq(categories.parentId, self.parentId)
        : isNull(categories.parentId),
    )
    .orderBy(asc(categories.sortOrder), asc(categories.createdAt))
    .all();

  const idx = siblings.findIndex((s) => s.id === id);
  if (idx < 0) return { ok: false, error: "分类不存在" };

  const target = direction === "up" ? idx - 1 : idx + 1;
  // 已经在头 / 尾：什么都不做，但不算失败
  if (target < 0 || target >= siblings.length) return { ok: true };

  const next = [...siblings];
  [next[idx], next[target]] = [next[target], next[idx]];

  db.transaction(() => {
    next.forEach((c, i) => {
      if (c.sortOrder === i) return; // 值没变就不写
      db.update(categories)
        .set({ sortOrder: i })
        .where(eq(categories.id, c.id))
        .run();
    });
  });

  revalidatePath("/categories");
  revalidatePath("/");
  return { ok: true };
}

export async function deleteCategory(
  id: string,
  mode: "move" | "delete",
): Promise<ActionResult> {
  await requireAdmin();

  const self = db.select().from(categories).where(eq(categories.id, id)).get();
  if (!self) return { ok: false, error: "分类不存在" };

  db.transaction(() => applyDeleteCategory(id, mode));

  revalidatePath("/categories");
  revalidatePath("/");
  revalidatePath("/bookmarks");
  return { ok: true };
}
