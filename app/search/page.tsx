import { buildGroups, getSearchView } from "@/lib/public/service";
import { SiteSearch } from "@/components/public/topbar";
import { PublicShell } from "@/components/public/shell";
import { CategoryCard } from "@/components/public/category-card";

export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q: raw } = await searchParams;
  const q = typeof raw === "string" ? raw : "";
  const view = await getSearchView(q);
  const hits = "hits" in view ? view.hits : [];

  // 命中结果按原分类重新分组，保持与首页一致的卡片形态
  const groups =
    hits.length > 0 ? buildGroups(view.categories, hits) : [];

  return (
    <PublicShell view={view} searchQuery={q}>
      <div className="mb-5">
        <h1 className="text-[22px] font-semibold leading-tight tracking-tight sm:text-[26px]">
          搜索
        </h1>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          {q.trim()
            ? `「${q.trim()}」· ${hits.length} 条结果`
            : "在顶部搜索框输入关键词，查找站内书签。"}
        </p>
      </div>


      <SiteSearch key={q} initialQuery={q} mobilePage />

      <section className="mt-7">
        {!q.trim() ? (
          <div className="rounded-xl border border-dashed border-border px-6 py-16 text-center">
            <p className="text-[15px] text-muted-foreground">输入关键词开始搜索</p>
            <p className="mt-1.5 text-[12.5px] text-muted-foreground/70">
              支持 <code className="font-mono">#标签</code>、
              <code className="font-mono">site:域名</code>、
              <code className="font-mono">&quot;短语&quot;</code>
            </p>
          </div>
        ) : groups.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-6 py-16 text-center">
            <p className="text-[15px] text-muted-foreground">没有匹配</p>
            <p className="mt-1.5 text-[12.5px] text-muted-foreground/70">
              试试更短的关键词，或用{" "}
              <code className="font-mono">site:域名</code>
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-2 xl:grid-cols-3">
            {groups.map((g) => (
              <CategoryCard key={g.id} group={g} showAll />
            ))}
          </div>
        )}
      </section>
    </PublicShell>
  );
}
