import { and, eq, isNull, or, type SQL } from "drizzle-orm";
import { bookmarks, categories } from "@/lib/db/schema";
import type { Viewer } from "@/lib/auth/session";

/**
 * 全站唯一的可见性判断入口。
 * 公开域只认 effective_visibility（写时已展开继承），
 * 且分类本身必须 public，避免「私有分类里的 public 书签」漏出。
 *
 * 未分类（category_id IS NULL）的书签没有分类可继承，只看自身
 * effective_visibility —— 否则显式公开的未分类书签在首页会凭空消失，
 * 而 lib/search.ts 又能搜到，两处结果对不上。
 */
export function visibleWhere(viewer: Viewer): SQL | undefined {
  if (viewer.kind === "admin") return undefined;
  return and(
    eq(bookmarks.effectiveVisibility, "public"),
    or(isNull(bookmarks.categoryId), eq(categories.visibility, "public")),
  );
}
