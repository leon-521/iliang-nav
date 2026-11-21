import { asc, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { tagsByBookmark } from "@/lib/bookmarks/tag-store";
import { bookmarks, categories } from "@/lib/db/schema";
import { BookmarkForm } from "@/components/admin/BookmarkForm";
import { getViewer } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { LinkCheckButton } from "@/components/admin/LinkCheckButton";
import { BookmarkTable, type Row } from "@/components/admin/BookmarkTable";
import { Main, PageHeader } from "@/components/layout/main";

export const dynamic = "force-dynamic";

/** 把分类树拍平成带缩进深度的列表，供下拉框用 */
function flatten(rows: (typeof categories.$inferSelect)[]) {
  const byParent = new Map<string | null, typeof rows>();
  for (const r of rows) {
    const k = r.parentId ?? null;
    if (!byParent.has(k)) byParent.set(k, []);
    byParent.get(k)!.push(r);
  }

  const out: Array<(typeof rows)[number] & { depth: number }> = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const r of byParent.get(parentId) ?? []) {
      out.push({ ...r, depth });
      walk(r.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

export default async function BookmarksPage() {
  if ((await getViewer()).kind !== "admin") redirect("/login");
  const catRows = db
    .select()
    .from(categories)
    .orderBy(asc(categories.sortOrder))
    .all();
  const flat = flatten(catRows);

  const catName = new Map(catRows.map((c) => [c.id, c.name]));

  const bookmarkRows = db
    .select({
      id: bookmarks.id,
      title: bookmarks.title,
      url: bookmarks.url,
      altUrl: bookmarks.altUrl,
      description: bookmarks.description,
      iconUrl: bookmarks.iconUrl,
      visibility: bookmarks.effectiveVisibility,
      ownVisibility: bookmarks.visibility,
      isBroken: bookmarks.isBroken,
      categoryId: bookmarks.categoryId,
      createdAt: bookmarks.createdAt,
      sortOrder: bookmarks.sortOrder,
    })
    .from(bookmarks)
    .orderBy(asc(bookmarks.sortOrder), asc(bookmarks.createdAt))
    .all();
  const labels = tagsByBookmark(bookmarkRows.map((row) => row.id));
  const rows: Row[] = bookmarkRows.map((r) => ({
      tags: labels.get(r.id) ?? [],
      id: r.id,
      title: r.title,
      url: r.url,
      altUrl: r.altUrl,
      description: r.description,
      iconUrl: r.iconUrl,
      visibility: r.visibility,
      ownVisibility: r.ownVisibility,
      isBroken: r.isBroken,
      categoryId: r.categoryId,
      categoryName: r.categoryId ? (catName.get(r.categoryId) ?? null) : null,
      sortOrder: r.sortOrder,
    }));

  const [pub] = db
    .select({
      n: sql<number>`sum(case when ${bookmarks.effectiveVisibility} = 'public' then 1 else 0 end)`,
    })
    .from(bookmarks)
    .all();

  return (
    <Main>
      <PageHeader
        title="书签"
        description={`共 ${rows.length} 条，其中 ${Number(pub?.n ?? 0)} 条公开可见。`}
      >
        <LinkCheckButton total={rows.length} />
        <BookmarkForm categories={flat} />
      </PageHeader>
      <BookmarkTable rows={rows} categories={flat} />
    </Main>
  );
}
