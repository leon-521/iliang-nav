import { HomeWeather, WeatherLoading } from "@/components/public/home-weather";
import { greetingFor, formatDate } from "@/lib/public/date";
import { Suspense } from "react";
import Link from "next/link";
import { HomeLoading } from "@/components/layout/home-loading";
import { ArrowDownUp, ArrowRight, ArrowUpRight, Bookmark, Clock3, Folder, LayoutGrid, Link2, List, Tag } from "lucide-react";
import { getPublicView } from "@/lib/public/service";
import { tagKey } from "@/lib/bookmarks/tags";
import { safeHref } from "@/lib/public/safe-href";
import { PublicShell } from "@/components/public/shell";
import { HomeBookmarkCard } from "@/components/public/home-bookmark-card";
import { NewCategoryDialog } from "@/components/public/new-category-dialog";
import { HomeCategoryOrder } from "@/components/public/home-category-order";
import { AddBookmarkButton, HomeQuickTools } from "@/components/public/quick-edit";
import { BookmarkletButton } from "@/components/public/bookmarklet-dialog";
import { displayTitle, Favicon, hostOf } from "@/components/public/favicon";

export const dynamic = "force-dynamic";

const dateLabel = new Intl.DateTimeFormat("zh-CN", {
  month: "short",
  day: "numeric",
  timeZone: "Asia/Shanghai",
});

type HomePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function PublicHomePage(props: HomePageProps) {
  return (
    <Suspense fallback={<HomeLoading />}>
      <HomeContent {...props} />
    </Suspense>
  );
}

async function HomeContent({ searchParams }: HomePageProps) {
  const [view, params] = await Promise.all([getPublicView(), searchParams]);
  const now = new Date();
  const { settings, groups, quickTools, total, categoryCount, isAdmin } = view;
  const filter = typeof params.category === "string" ? params.category : "";
  const groupKey = (group: (typeof groups)[number]) => group.slug ?? group.id;
  const currentGroup = groups.find((group) => groupKey(group) === filter);
  const listView = params.view === "list";
  const recentFirst = params.sort === "recent";
  const cards = groups.flatMap((group) =>
    group.items.map(({ bookmark, subName }) => ({ bookmark, tag: subName ?? group.name })),
  ).sort((a, b) => a.bookmark.sortOrder - b.bookmark.sortOrder || a.bookmark.createdAt - b.bookmark.createdAt || a.bookmark.id.localeCompare(b.bookmark.id));
  const tags = new Map<string, { label: string; count: number }>();
  for (const { bookmark } of cards) {
    for (const label of bookmark.tags) {
      const key = tagKey(label);
      const entry = tags.get(key);
      if (entry) entry.count += 1;
      else tags.set(key, { label, count: 1 });
    }
  }
  const tagFilter = typeof params.tag === "string" ? tagKey(params.tag) : "";
  const orderedTags = [...tags].sort(([, a], [, b]) => b.count - a.count || a.label.localeCompare(b.label, "zh-CN"));
  const recent = [...cards].sort((a, b) => b.bookmark.createdAt - a.bookmark.createdAt);
  const selectedIds = currentGroup && new Set(currentGroup.items.map(({ bookmark }) => bookmark.id));
  const visible = (recentFirst ? recent : cards).filter(({ bookmark }) => (!selectedIds || selectedIds.has(bookmark.id)) && (!tagFilter || bookmark.tags.some((tag) => tagKey(tag) === tagFilter)));
  const pageSize = 24;
  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const page = typeof params.page === "string" && /^[1-9]\d*$/.test(params.page) ? Math.min(Number(params.page), pageCount) : 1;

  function libraryHref({ category = currentGroup ? groupKey(currentGroup) : "", list = listView, recent = recentFirst, page = 1, tag = tagFilter } = {}) {
    const query = new URLSearchParams();
    if (category) query.set("category", category);
    if (tag) query.set("tag", tag);
    if (list) query.set("view", "list");
    if (recent) query.set("sort", "recent");
    if (page > 1) query.set("page", String(page));
    return `/${query.size ? `?${query}` : ""}#categories`;
  }

  const control = "inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 text-xs transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
  const selected = "bg-indigo-soft font-medium text-indigo-ink hover:bg-indigo-soft";

  return (
    <PublicShell view={view} wide>
      <section aria-labelledby="home-title" className="mb-7 space-y-5 motion-safe:animate-fade-up">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">{formatDate(now)}</p>
            <h1 id="home-title" className="text-[26px] font-semibold tracking-tight sm:text-[32px]">
              {greetingFor(now)}{settings.ownerName.trim() && <span className="text-indigo-ink">，{settings.ownerName.trim()}</span>}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {settings.siteTagline || "把值得收藏的灵感，变成每天都用得上的入口。"}
            </p>
          </div>
          {isAdmin && <div className="flex flex-wrap items-center gap-2">
            {view.categories.length > 0 && <HomeCategoryOrder categories={view.categories} />}
            <NewCategoryDialog categories={view.categoryOptions} className="lg:hidden" />
            <AddBookmarkButton categories={view.categoryOptions} label="添加书签" size="home" />
          </div>}
        </div>
      </section>

      <div className="grid min-w-0 items-start gap-8 xl:grid-cols-[minmax(0,1fr)_22%]">
        <div className="min-w-0 space-y-8">
          <HomeQuickTools items={quickTools} showIcons={settings.showIcons} isAdmin={isAdmin} categoryOptions={isAdmin ? view.categoryOptions : []}
            initialIds={isAdmin ? settings.quickToolIds : []} candidates={isAdmin ? cards.map(({ bookmark }) => bookmark) : []} />

          <section id="categories" aria-labelledby="library-title" className="scroll-mt-32">
            <div className="flex items-center justify-between gap-2">
              <h2 id="library-title" className="font-semibold">我的书签 <span className="ms-1 text-xs font-normal text-muted-foreground">{visible.length}</span></h2>
              {!!total && <Link className={control} href={libraryHref({ recent: !recentFirst })}><ArrowDownUp className="size-3.5" aria-hidden />{recentFirst ? "最近添加" : "默认排序"}</Link>}
            </div>
            {!!total && (
              <div className="mb-5 mt-3 flex flex-wrap items-start justify-between gap-2">
                <nav aria-label="筛选书签分类" className="flex min-w-0 flex-wrap gap-1">
                  <Link href={libraryHref({ category: "" })} aria-current={!currentGroup ? "true" : undefined} className={`${control} ${!currentGroup ? selected : ""}`}>全部</Link>
                  {groups.map((group) => (
                    <Link key={group.id} href={libraryHref({ category: groupKey(group) })} aria-current={currentGroup?.id === group.id ? "true" : undefined} className={`${control} max-w-full break-all ${currentGroup?.id === group.id ? selected : ""}`}>{group.name}</Link>
                  ))}
                </nav>
                <nav aria-label="书签视图" className="flex shrink-0 gap-1 rounded-lg border bg-card p-0.5">
                  <Link href={libraryHref({ list: false, page })} aria-label="卡片视图" aria-current={!listView ? "true" : undefined} className={`${control} !px-2.5 ${!listView ? selected : ""}`}><LayoutGrid className="size-4" aria-hidden /></Link>
                  <Link href={libraryHref({ list: true, page })} aria-label="列表视图" aria-current={listView ? "true" : undefined} className={`${control} !px-2.5 ${listView ? selected : ""}`}><List className="size-4" aria-hidden /></Link>
                </nav>
              </div>
            )}
            {tagFilter && <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="break-all">当前标签：{tags.get(tagFilter)?.label ?? tagFilter.slice(0, 50)}</span>
              <Link href={libraryHref({ tag: "" })} className="font-medium text-indigo-ink hover:underline">清除标签筛选</Link>
            </div>}
            {visible.length ? (
              <ul className={`grid ${listView ? "gap-2" : "items-start gap-4 sm:grid-cols-2 min-[1440px]:grid-cols-3"}`}>
                {visible.slice((page - 1) * pageSize, page * pageSize).map(({ bookmark: b, tag }, index) => {
                  const label = displayTitle(b.title, b.url);
                  const position = (page - 1) * pageSize + index;
                  const className = `flex min-w-0 rounded-xl border bg-card dark:bg-[color-mix(in_oklab,var(--card)_84%,var(--foreground))] hover:border-primary/45 focus-within:border-primary/45 motion-safe:transition-[border-color,box-shadow] motion-safe:duration-200 hover:shadow-sm ${listView ? "flex-wrap items-center gap-3 px-4 py-3" : "flex-col px-3 py-2.5"}`;
                  const content = <>
                      <a href={safeHref(b.url)} target="_blank" rel="noopener noreferrer" className={`group rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring ${listView ? "min-w-0 flex-1" : "flex-1"}`}>
                        <span className="flex min-w-0 items-center gap-3">
                          {settings.showIcons && <Favicon title={label} url={b.url} iconUrl={b.iconUrl} iconHidden={b.iconHidden} size={36} />}
                          <span className="min-w-0 flex-1">
                            <span className={`block [overflow-wrap:anywhere] font-semibold leading-snug group-hover:text-primary ${[...label].length > 34 ? "text-xs" : "text-sm"}`}>{label}</span>
                            <span className="block truncate text-[11px] text-muted-foreground">{hostOf(b.url)}</span>
                          </span>
                          <ArrowUpRight className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" aria-hidden />
                        </span>
                        {b.description?.trim() && <span className={`mt-2 text-xs leading-relaxed text-secondary-foreground [overflow-wrap:anywhere] ${listView ? "block whitespace-pre-line" : "block max-w-[32ch] truncate"}`}>{b.description}</span>}
                      </a>
                      </>;
                   const metadata = <>
                     <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
                       <span title={tag} className="max-w-full truncate rounded-md bg-indigo-soft px-1.5 py-0.5 text-[11px] text-indigo-ink">{tag}</span>
                       {b.tags.slice(0, 5).map((name) => <Link key={tagKey(name)} href={libraryHref({ tag: tagKey(name) })} title={name} className="max-w-full truncate rounded-md bg-secondary px-1.5 py-0.5 text-[11px] text-secondary-foreground hover:text-primary">#{name}</Link>)}
                     </div>
                     {b.altUrl && <a href={safeHref(b.altUrl)} target="_blank" rel="noopener noreferrer" aria-label={`${label} 的备用链接`} title="备用链接" className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-primary"><Link2 className="size-4" aria-hidden /></a>}
                   </>;
                   const footerClass = `flex min-w-0 items-center gap-1 ${listView ? "w-full" : "mt-2"}`;
                   return isAdmin ? (
                    <HomeBookmarkCard key={b.id} id={b.id} label={label} categories={view.categoryOptions}
                      previous={recentFirst ? undefined : visible[position - 1]?.bookmark.id}
                      next={recentFirst ? undefined : visible[position + 1]?.bookmark.id} className={className} footerClass={footerClass} metadata={metadata}>
                      {content}
                    </HomeBookmarkCard>
                  ) : <li key={b.id} className={className}>{content}<div className={footerClass}>{metadata}</div></li>;
                })}
              </ul>
            ) : (
              <div className="mt-4 flex flex-col items-center rounded-xl border border-dashed bg-card px-5 py-14 text-center sm:py-20">
                <span className="mb-4 rounded-xl bg-indigo-soft p-3 text-indigo-ink"><Bookmark className="size-5" aria-hidden /></span>
                <p className="text-sm font-medium">{tagFilter ? "没有符合筛选的书签" : isAdmin ? "添加你的第一个书签" : "还没有公开书签"}</p>
                <p className="mt-2 text-xs text-muted-foreground">{tagFilter ? "可清除标签或选择其他分类。" : isAdmin ? "收藏常用网站，或导入浏览器书签。" : "公开书签添加后会显示在这里。"}</p>
                {isAdmin && !tagFilter && <Link href="/import" className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-indigo-ink hover:underline">导入书签 <ArrowRight className="size-3.5" aria-hidden /></Link>}
              </div>
            )}
            {pageCount > 1 && <nav aria-label="书签分页" className="mt-5 flex flex-wrap items-center justify-center gap-3 text-xs text-muted-foreground">
              {page > 1 && <Link className={control} href={libraryHref({ page: page - 1 })}>上一页</Link>}
              <span>第 {page} / {pageCount} 页</span>
              {page < pageCount && <Link className={control} href={libraryHref({ page: page + 1 })}>下一页</Link>}
            </nav>}
          </section>
        </div>

        <aside aria-label="书签概览" className="grid min-w-0 gap-6 border-t pt-6 motion-safe:animate-fade-in sm:grid-cols-2 xl:grid-cols-1 xl:border-s xl:border-t-0 xl:ps-6 xl:pt-0">
          {settings.weather && <Suspense fallback={<WeatherLoading />}><HomeWeather location={settings.weather} /></Suspense>}
          <section className="relative isolate overflow-hidden rounded-xl border bg-indigo-soft p-5 text-indigo-ink">
            <Bookmark className="pointer-events-none absolute -end-3 top-5 -z-10 size-24 -rotate-12 opacity-15" strokeWidth={0.8} aria-hidden />
            <p className="text-[10px] font-semibold tracking-[0.12em]">YOUR BOOKMARK SPACE</p>
            <h2 className="mt-2 text-[22px] font-semibold leading-snug">收藏灵感，<br />也收藏可能。</h2>
            <p className="mt-2 text-xs leading-relaxed">你的互联网，有自己的秩序。</p>
            {isAdmin && <Link href="/categories" className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium hover:underline">整理我的分类 <ArrowRight className="size-3.5" aria-hidden /></Link>}
          </section>
          <section aria-labelledby="bookmark-tags-title" className="min-w-0 rounded-xl border bg-card p-4">
            <h2 id="bookmark-tags-title" className="flex items-center gap-2 text-sm font-semibold"><Tag className="size-4 text-indigo-ink" aria-hidden />书签标签</h2>
            {orderedTags.length ? (
              <ul className="mt-3 flex max-h-56 flex-wrap gap-2 overflow-auto p-0.5">
                {orderedTags.map(([key, value]) => (
                  <li key={key} className="max-w-full">
                    <Link href={libraryHref({ tag: tagFilter === key ? "" : key, category: "" })} aria-current={tagFilter === key ? "true" : undefined} className={`inline-flex max-w-full items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs focus-visible:outline-2 focus-visible:outline-ring ${tagFilter === key ? selected : "bg-secondary text-secondary-foreground hover:text-primary"}`}>
                      <span className="min-w-0 break-all">{value.label}</span><span className="shrink-0 tabular-nums text-muted-foreground">{value.count}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-2 text-xs text-muted-foreground">{isAdmin ? "编辑书签后，标签会显示在这里。" : "暂无可见标签。"}</p>}
          </section>
          <section id="recent-bookmarks" className="scroll-mt-32 min-w-0 rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold"><Clock3 className="size-4 text-indigo-ink" aria-hidden />最近收藏</h2>
              {recent.length > 0 && <Link href={libraryHref({ category: "", recent: true, tag: "" })} className="text-[11px] text-indigo-ink hover:underline">查看全部</Link>}
            </div>
            {recent.length ? <ul className="mt-3 space-y-1">
              {recent.slice(0, 4).map(({ bookmark: b }) => {
                const date = new Date(b.createdAt * 1000);
                return <li key={b.id}><a href={safeHref(b.url)} target="_blank" rel="noopener noreferrer" className="flex min-h-12 items-center gap-2 rounded-lg px-1 py-1.5 hover:bg-secondary">
                  {settings.showIcons && <Favicon title={b.title} url={b.url} iconUrl={b.iconUrl} iconHidden={b.iconHidden} size={30} />}
                  <span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium">{displayTitle(b.title, b.url)}</span><span className="block truncate text-[11px] text-muted-foreground">{hostOf(b.url)}</span></span>
                  <time dateTime={date.toISOString()} className="shrink-0 text-[11px] text-muted-foreground">{dateLabel.format(date)}</time>
                </a></li>;
              })}
            </ul> : <p className="mt-3 text-xs text-muted-foreground">暂无最近收藏。</p>}
          </section>
          <section className="min-w-0 rounded-xl border bg-card p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold"><Folder className="size-4 text-indigo-ink" aria-hidden />书签统计</h2>
            <dl className="mt-3 grid grid-cols-2 gap-3">
              <div><dt className="text-[11px] text-muted-foreground">书签</dt><dd className="text-[26px] font-semibold tabular-nums text-indigo-ink">{total}</dd></div>
              <div><dt className="text-[11px] text-muted-foreground">分类</dt><dd className="text-[26px] font-semibold tabular-nums text-indigo-ink">{categoryCount}</dd></div>
            </dl>
          </section>
          {isAdmin && <section className="rounded-lg border bg-secondary/55 p-4">
            <h2 className="text-xs font-semibold">遇到好网站，顺手收藏</h2>
            <p className="mb-2 mt-1 text-[11px] leading-relaxed text-muted-foreground">用浏览器书签工具，一键添加当前页面。</p>
            <BookmarkletButton baseUrl={process.env.PUBLIC_BASE_URL} />
          </section>}
        </aside>
      </div>
    </PublicShell>
  );
}
