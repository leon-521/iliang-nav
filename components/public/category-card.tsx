import { createElement } from "react";
import Link from "next/link";
import { ArrowUpRight, Link2 } from "lucide-react";
import { Favicon, displayTitle, hostOf } from "./favicon";
import { iconForCategory } from "./nav-icons";
import { safeHref } from "@/lib/public/safe-href";
import type { PublicGroup, PublicBookmark } from "@/lib/public/service";

/** 分类图标块的配色：主色系浅绿，与设计稿一致 */
const TILE_BG = "color-mix(in oklab, var(--primary) 10%, transparent)";
const TILE_FG = "var(--primary)";

/** 每个分类卡里最多显示几条书签（设计稿是 2×2） */
const PREVIEW_LIMIT = 4;

/**
 * 分类卡的一行书签：图标 + 名称 + 描述。
 *
 * 有备用链接时右侧多一个小入口。
 * 外层必须是 div 而不是 a —— HTML 不允许 a 套 a，嵌套后浏览器会把
 * 内层链接拆到外面，点哪儿都跳主站，备用入口等于失效。
 */
function MiniRow({ b }: { b: PublicBookmark }) {
  const label = displayTitle(b.title, b.url);
  const sub = b.description?.trim() || hostOf(b.url);

  return (
    <div className="group/row -mx-1.5 flex min-h-[46px] items-center gap-1 rounded-lg px-1.5 py-1.5 transition-colors duration-150 hover:bg-secondary">
      <a
        href={safeHref(b.url)}
        target="_blank"
        rel="noopener noreferrer"
        title={b.description ?? label}
        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Favicon
          title={label}
          url={b.url}
          iconUrl={b.iconUrl}
          iconHidden={b.iconHidden}
          size={26}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] font-medium leading-snug">
            {label}
          </span>
          <span className="mt-0.5 block truncate text-[11px] leading-snug text-muted-foreground">
            {sub}
          </span>
        </span>
      </a>

      {b.altUrl ? (
        <a
          href={safeHref(b.altUrl)}
          target="_blank"
          rel="noopener noreferrer"
          title={`备用链接：${hostOf(b.altUrl)}`}
          aria-label={`${label} 的备用链接`}
          className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/40 transition-colors duration-150 hover:bg-card hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Link2 className="size-3.5" />
        </a>
      ) : (
        <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground/25 transition-colors duration-150 group-hover/row:text-primary" />
      )}
    </div>
  );
}

/** 一个分类卡片：标题行 + 描述 + 2×2 书签 */
export function CategoryCard({
  group,
  index = 0,
  showAll = false,
}: {
  group: PublicGroup;
  /** 用于错峰入场动画 */
  index?: number;
  /** 搜索页展示所有匹配项，不能跳转到无筛选的分类页才能看到其余项。 */
  showAll?: boolean;
}) {
  // 用 createElement 而不是 <Icon />：图标是按分类名查表得来的，
  // 写成大写变量会让 React 编译器判定「在 render 里创建组件」并报错
  const icon = iconForCategory(group.name);
  const isUncat = group.id === "__uncat__";
  const preview = showAll ? group.items : group.items.slice(0, PREVIEW_LIMIT);
  const more = group.items.length - preview.length;

  /*
   * 卡片标题行。
   *
   * 不能把整张卡包成 <Link>：卡里每一行书签本身就是 <a>，
   * 外层再套一个 <a> 就成了嵌套锚点 —— 浏览器解析时会自作主张
   * 把内层拆出去，DOM 与服务端 HTML 对不上，客户端一水合就报
   * React #418（而且只在用这个组件的首页和搜索页复现）。
   * 所以链接只包标题行，行内书签各自独立。
   */
  const head = (
    <>
      <span
        aria-hidden
        className="flex size-9 shrink-0 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-[1.05]"
        style={{ backgroundColor: TILE_BG, color: TILE_FG }}
      >
        {createElement(icon, { className: "size-[17px]" })}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[14px] font-semibold leading-tight">
            {group.name}
          </span>
          <span className="shrink-0 font-mono text-[10.5px] tabular-nums text-muted-foreground/60">
            {String(group.items.length).padStart(2, "0")}
          </span>
        </span>
        <span className="mt-1 block truncate text-[11px] text-muted-foreground">
          {isUncat
            ? "还没归类的书签"
            : `共 ${group.items.length} 个书签，点击查看全部`}
        </span>
      </span>

      {isUncat ? null : (
        <ArrowUpRight className="mt-1 size-3.5 shrink-0 text-muted-foreground/30 transition-all duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary" />
      )}
    </>
  );

  const shell =
    "group block rounded-xl border border-border bg-card p-4 card-hover animate-fade-up";
  const delay = { animationDelay: `${Math.min(index, 8) * 45}ms` };

  return (
    <section id={`g-${group.id}`} style={delay} className={shell}>
      {isUncat ? (
        <div className="flex items-start gap-2.5">{head}</div>
      ) : (
        <Link
          href={`/c/${encodeURIComponent(group.slug ?? group.id)}`}
          className="-m-1 flex items-start gap-2.5 rounded-lg p-1 transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {head}
        </Link>
      )}

      <div className="mt-3 grid grid-cols-1 gap-x-3 border-t border-border pt-2 sm:grid-cols-2">
        {preview.map(({ bookmark }) => (
          <MiniRow key={bookmark.id} b={bookmark} />
        ))}
      </div>

      {more > 0 ? (
        <p className="mt-1.5 text-[11px] text-muted-foreground/70">
          还有 {more} 个…
        </p>
      ) : null}
    </section>
  );
}

export const quickToolsGridClass = "grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6";

export function QuickToolCard({ bookmark: b, showIcons, index }: {
  bookmark: PublicBookmark;
  showIcons: boolean;
  index: number;
}) {
  const label = displayTitle(b.title, b.url);
  return (
    <a
      href={safeHref(b.url)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={b.description?.trim() ? `${label}\n${b.description.trim()}` : label}
      style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}
      className="group flex h-28 min-w-0 animate-fade-up flex-col items-center justify-center gap-2 overflow-hidden rounded-[10px] border bg-card px-2 py-3 transition-colors hover:border-primary/45 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      {showIcons ? (
        <Favicon title={label} url={b.url} iconUrl={b.iconUrl} iconHidden={b.iconHidden} size={28} />
      ) : (
        <span className="flex size-7 items-center justify-center rounded-md bg-secondary text-[13px] font-semibold text-muted-foreground">
          {label.charAt(0).toUpperCase()}
        </span>
      )}
      <span className="block w-full min-w-0 text-center">
        <span className="block truncate text-xs font-medium leading-4">{label}</span>
        <span className="mt-1 block truncate text-[11px] leading-4 text-muted-foreground">{b.description?.trim() || hostOf(b.url)}</span>
      </span>
    </a>
  );
}

/** Read-only quick tools, for guests and other public pages. */
export function QuickTools({ items, showIcons = true }: { items: PublicBookmark[]; showIcons?: boolean }) {
  if (!items.length) return null;
  return <div className={quickToolsGridClass}>
    {items.map((bookmark, index) => <QuickToolCard key={bookmark.id} bookmark={bookmark} index={index} showIcons={showIcons} />)}
  </div>;
}
