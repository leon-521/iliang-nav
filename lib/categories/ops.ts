/**
 * 分类树的纯数据操作。
 *
 * 单独成文件（不带 "use server"）的原因：
 *  - Server Action 文件只允许导出 async 函数，同步辅助函数没处放；
 *  - 这些逻辑要能被单测直接调用，不必伪造登录态。
 */
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookmarks, categories } from "@/lib/db/schema";

/** 收集 id 及其全部后代的 id（广度优先，脏数据成环也不会死循环） */
export function collectSubtree(id: string): string[] {
  const all = db
    .select({ id: categories.id, parentId: categories.parentId })
    .from(categories)
    .all();

  const childrenOf = new Map<string | null, string[]>();
  for (const c of all) {
    const k = c.parentId ?? null;
    const arr = childrenOf.get(k);
    if (arr) arr.push(c.id);
    else childrenOf.set(k, [c.id]);
  }

  const out: string[] = [];
  const seen = new Set<string>();
  const queue = [id];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (seen.has(cur)) continue;
    seen.add(cur);
    out.push(cur);
    queue.push(...(childrenOf.get(cur) ?? []));
  }
  return out;
}

/** 分类的可见性；分类不存在或为顶层时返回 private（与 resolveVisibility 一致） */
function visibilityOf(categoryId: string | null): string {
  if (!categoryId) return "private";
  const row = db
    .select({ v: categories.visibility })
    .from(categories)
    .where(eq(categories.id, categoryId))
    .get();
  return row?.v ?? "private";
}

/**
 * 删分类：move 模式把书签和直接子分类挂到父级，delete 模式删整棵子树。
 *
 * 必须在事务里调用。move 模式的关键点是**重算继承可见性**：
 * 公开分类下继承 public 的书签移到 unlisted 父级后，如果只改 category_id，
 * effective_visibility 还留着 public，会漏出到公开域。
 */
export function applyDeleteCategory(id: string, mode: "move" | "delete") {
  const self = db.select().from(categories).where(eq(categories.id, id)).get();
  if (!self) return;

  const now = Math.floor(Date.now() / 1000);

  if (mode === "move") {
    const parentVis = visibilityOf(self.parentId);

    const moved = db
      .select({ id: bookmarks.id, visibility: bookmarks.visibility })
      .from(bookmarks)
      .where(eq(bookmarks.categoryId, id))
      .all();

    for (const b of moved) {
      db.update(bookmarks)
        .set({
          categoryId: self.parentId,
          // 显式设置过可见性的不动；继承的跟着新分类走
          effectiveVisibility: b.visibility ?? parentVis,
          updatedAt: now,
        })
        .where(eq(bookmarks.id, b.id))
        .run();
    }

    // 直接子分类挂到父级
    db.update(categories)
      .set({ parentId: self.parentId })
      .where(eq(categories.parentId, id))
      .run();

    db.delete(categories).where(eq(categories.id, id)).run();
    return;
  }

  // delete：整棵子树一起删，先删书签再从叶子往上删分类
  const ids = collectSubtree(id);
  db.delete(bookmarks).where(inArray(bookmarks.categoryId, ids)).run();
  for (const cid of [...ids].reverse()) {
    db.delete(categories).where(eq(categories.id, cid)).run();
  }
}
