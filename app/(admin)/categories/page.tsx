import { asc, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookmarks, categories } from "@/lib/db/schema";
import { CategoryTree, type CatNode } from "@/components/admin/CategoryTree";
import { Main, PageHeader } from "@/components/layout/main";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const rows = db
    .select()
    .from(categories)
    .orderBy(asc(categories.sortOrder))
    .all();

  const counts = new Map(
    db
      .select({ id: bookmarks.categoryId, n: sql<number>`count(*)` })
      .from(bookmarks)
      .groupBy(bookmarks.categoryId)
      .all()
      .filter((r) => r.id)
      .map((r) => [r.id as string, Number(r.n)]),
  );

  const byParent = new Map<string | null, typeof rows>();
  for (const r of rows) {
    const k = r.parentId ?? null;
    if (!byParent.has(k)) byParent.set(k, []);
    byParent.get(k)!.push(r);
  }

  /*
   * 子树总数。父分类如果只显示「直接挂在自己名下」的数量，
   * 就会出现「父分类 0、点进去却有一堆」的错觉 —— 后台尤其需要
   * 一眼看出每个分类实际管着多少书签。
   */
  const subtree = new Map<string, number>();
  const sumSubtree = (id: string): number => {
    const cached = subtree.get(id);
    if (cached !== undefined) return cached;
    let n = counts.get(id) ?? 0;
    for (const child of byParent.get(id) ?? []) n += sumSubtree(child.id);
    subtree.set(id, n);
    return n;
  };

  const build = (parentId: string | null): CatNode[] =>
    (byParent.get(parentId) ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      parentId: r.parentId,
      visibility: r.visibility,
      count: counts.get(r.id) ?? 0,
      total: sumSubtree(r.id),
      children: build(r.id),
    }));

  const tree = build(null);

  const flat: Array<{ id: string; name: string; depth: number }> = [];
  const walk = (nodes: CatNode[], depth: number) => {
    for (const n of nodes) {
      flat.push({ id: n.id, name: n.name, depth });
      walk(n.children, depth + 1);
    }
  };
  walk(tree, 0);

  return (
    <Main>
      <PageHeader
        title="分类"
        description={`${rows.length} 个分类。分类的可见性会级联到未单独设置的书签。`}
      />
      <CategoryTree tree={tree} flat={flat} />
    </Main>
  );
}
