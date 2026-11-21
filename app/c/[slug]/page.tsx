import { createElement } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ChevronRight } from "lucide-react";
import { getCategoryView } from "@/lib/public/service";
import { PublicShell } from "@/components/public/shell";
import { CategoryGrid } from "@/components/public/category-grid";
import { SubCategoryGrid } from "@/components/public/sub-category-grid";
import { iconForCategory } from "@/components/public/nav-icons";

export const dynamic = "force-dynamic";

/**
 * 分类页路由：/c/<slug>
 *
 * 用 slug 而不是 id：分类 id 是 uuid，塞进地址栏又长又没法认。
 * 取不到视图（分类不存在 / 访客访问私有分类）一律 404，
 * 不能返回「空分类页」——那等于告诉访客这个分类存在。
 *
 * 层级展示：
 *   默认只列「直接挂在本分类下」的书签，子分类单独给入口卡。
 *   以前把整棵子树摊平，顶层分类一有子分类就是几十条混在一起的卡片，
 *   除了每张上的小标签完全看不出归属 —— 这就是「乱」的来源。
 *   想看全的用 ?all=1，仍然是摊平视图，但至少是用户主动选的。
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const view = await getCategoryView(decodeURIComponent(slug));
  if (!view) return { title: "分类不存在" };

  return {
    title: `${view.category.name} · ${view.settings.siteName}`,
    description: `${view.category.name}分类下的 ${view.entries.length} 个书签。`,
  };
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ all?: string }>;
}) {
  const { slug } = await params;
  const { all } = await searchParams;
  const view = await getCategoryView(decodeURIComponent(slug));
  if (!view) notFound();

  const { category, entries, subtreeEntries, children, ancestors, settings } = view;
  const showAll = all === "1";
  const list = showAll ? subtreeEntries : entries;

  // 用 createElement 而不是 <Icon />：图标是按分类名查表得来的，
  // 写成大写变量会让 React 编译器判定「在 render 里创建组件」并报错
  const icon = iconForCategory(category.name);

  const href = (s: string) => `/c/${encodeURIComponent(s)}`;
  const hasChildren = children.length > 0;

  /*
   * 顶栏面包屑的多级路径："书签首页 > 上级 > 本页"。
   * 只传当前页名的话，二级分类在顶栏会直接挂在首页下，
   * 看起来像它是个一级分类。
   */
  const crumbParents = ancestors.map((a) => ({
    label: a.name,
    href: href(a.slug),
  }));

  return (
    <PublicShell view={view} crumb={category.name} crumbParents={crumbParents}>
      {/* 面包屑：多级分类要能一路点回去，否则只能靠浏览器后退 */}
      {ancestors.length > 0 ? (
        <nav
          aria-label="分类路径"
          className="mb-3 flex flex-wrap items-center gap-0.5 text-[11.5px] text-muted-foreground"
        >
          <Link href="/" className="transition-colors hover:text-primary">
            全部书签
          </Link>
          {ancestors.map((a) => (
            <span key={a.slug} className="flex items-center gap-0.5">
              <ChevronRight className="size-3 shrink-0 opacity-50" aria-hidden />
              <Link
                href={href(a.slug)}
                className="transition-colors hover:text-primary"
              >
                {a.name}
              </Link>
            </span>
          ))}
          <ChevronRight className="size-3 shrink-0 opacity-50" aria-hidden />
          <span className="text-foreground">{category.name}</span>
        </nav>
      ) : null}

      {/* 分类头部：大图标 + 标题 + 计数 */}
      <div className="mb-5 flex animate-fade-up items-center gap-3.5">
        <span
          aria-hidden
          className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
        >
          {createElement(icon, { className: "size-6" })}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <h1 className="truncate text-[24px] font-semibold leading-tight tracking-tight sm:text-[28px]">
              {category.name}
            </h1>
            <span className="shrink-0 text-[11.5px] text-muted-foreground">
              {subtreeEntries.length} 个书签
            </span>
          </div>
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            {hasChildren
              ? `${children.length} 个子分类 · 本级 ${entries.length} 个书签`
              : `我的分类 · ${entries.length} 个书签`}
          </p>
        </div>
      </div>

      {/* 子分类入口：这就是「二级/多级分类的链接」 */}
      <SubCategoryGrid items={children} />

      {/* 列表头：排序 + 视图切换的视觉锚点 */}
      <div className="mb-2.5 mt-6 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold">
          {showAll ? "全部书签（含子分类）" : "本级书签"}
        </h2>
        <div className="flex items-center gap-3">
          <span className="text-[11.5px] text-muted-foreground/70">
            共 {list.length} 个
          </span>
          {hasChildren ? (
            <Link
              href={showAll ? href(category.slug) : `${href(category.slug)}?all=1`}
              className="rounded-md px-2 py-1 text-[11.5px] text-primary transition-colors hover:bg-primary/8"
            >
              {showAll ? "只看本级" : `查看含子分类的全部 ${subtreeEntries.length} 个`}
            </Link>
          ) : null}
        </div>
      </div>

      <section>
        {list.length === 0 && hasChildren && !showAll ? (
          /*
           * 本级没书签、但下面有子分类：不要再摆一个空框，
           * 那看起来像「这个分类坏了」。给一句指路 + 一个出口。
           */
          <div className="animate-fade-up rounded-xl border border-dashed border-border bg-card/50 px-6 py-12 text-center">
            <p className="text-[15px] text-muted-foreground">书签都在子分类里</p>
            <p className="mt-1.5 text-[12.5px] text-muted-foreground/70">
              点上面的子分类卡片进去看，或者
              <Link
                href={`${href(category.slug)}?all=1`}
                className="mx-1 text-primary underline-offset-4 hover:underline"
              >
                一次看完这 {subtreeEntries.length} 个
              </Link>
            </p>
          </div>
        ) : list.length === 0 ? (
          <div className="animate-fade-up rounded-xl border border-dashed border-border bg-card/50 px-6 py-20 text-center">
            <p className="text-[15px] text-muted-foreground">这个分类还是空的</p>
            <p className="mt-1.5 text-[12.5px] text-muted-foreground/70">
              去后台添加书签，或把它归到这个分类下。
            </p>
          </div>
        ) : (
          /*
           * key 用分类 id + 视图模式：从一个分类跳到另一个分类时，
           * App Router 可能复用同一个客户端组件实例，
           * 不带 key 就会沿用上一个分类的「已显示 N 个」。
           */
          <CategoryGrid
            key={`${category.id}:${showAll ? "all" : "direct"}`}
            entries={list}
            showIcons={settings.showIcons}
          />
        )}
      </section>

      {list.length > 0 ? (
        <p className="mt-6 flex items-center justify-center gap-1.5 text-[11.5px] text-muted-foreground/60">
          <span className="size-1.5 rounded-full bg-primary/60" aria-hidden />
          已显示 {list.length} 个书签
          {showAll ? "（含子分类）" : ""}
        </p>
      ) : null}
    </PublicShell>
  );
}
