import { asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories } from "@/lib/db/schema";

/** 下拉框需要的分类选项：只带 id / 名称 / 层级，不带可见性等管理字段 */
export type CategoryOption = { id: string; name: string; depth: number };

/**
 * 拍平分类树（带缩进深度）。
 *
 * 页面组件不直接 db.select()，所以这类查询统一放 service 层。
 * 带环检测：parentId 数据脏了也不会死循环。
 */
export function listCategoryOptions(): CategoryOption[] {
  const rows = db
    .select({
      id: categories.id,
      name: categories.name,
      parentId: categories.parentId,
    })
    .from(categories)
    .orderBy(asc(categories.sortOrder))
    .all();

  const byParent = new Map<string | null, typeof rows>();
  for (const row of rows) {
    const key = row.parentId ?? null;
    const arr = byParent.get(key);
    if (arr) arr.push(row);
    else byParent.set(key, [row]);
  }

  const out: CategoryOption[] = [];
  const seen = new Set<string>();

  const walk = (parentId: string | null, depth: number) => {
    for (const row of byParent.get(parentId) ?? []) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      out.push({ id: row.id, name: row.name, depth });
      walk(row.id, depth + 1);
    }
  };

  walk(null, 0);

  // 成环的孤儿（父节点不存在）兜底追加，别让它们从下拉框里消失
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    out.push({ id: row.id, name: row.name, depth: 0 });
  }

  return out;
}
