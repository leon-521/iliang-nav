"use client";

import * as React from "react";
import Link from "next/link";
import { Dialog as Drawer } from "radix-ui";
import { NewCategoryDialog } from "./new-category-dialog";
import type { CategoryOption } from "@/lib/public/service";
import { usePathname } from "next/navigation";
import { Bookmark, ChevronRight, Clock3, LayoutGrid, Search, Settings2, Star, X } from "lucide-react";
import { iconForCategory } from "./nav-icons";
import { PROJECT_GITHUB_URL } from "@/lib/project-version";
import { cn } from "@/lib/utils";
import { openLogin } from "@/lib/public/login-bus";

export type SidebarCategory = {
  id: string;
  name: string;
  slug: string;
  /** 父分类；null 表示顶层 */
  parentId: string | null;
  /** 含所有后代分类的书签数 */
  count: number;
  /** 缩进层级，顶层为 0 */
  depth?: number;
};

/** 两位补零：设计稿里计数统一显示成 04 / 12 这种等宽形式 */
function pad(n: number) {
  return String(n).padStart(2, "0");
}

/**
 * 分类树。
 *
 * 原来侧栏是把整棵树摊平成一长列，子分类靠缩进表示层级 ——
 * 分类一多，一屏全是缩进的条目，既看不出哪几个属于同一个父级，
 * 也把「新建分类」「设置」这些固定项挤到了滚动区外面。
 *
 * 现在父分类右侧带一个箭头，点开才显示子分类；
 * 当前页所在的路径会自动展开，所以从首页点进二级分类时
 * 侧栏仍然是展开的，不会让人以为自己点错了。
 */
function CategoryTree({
  categories,
  pathname,
  onNavigate,
}: {
  categories: SidebarCategory[];
  pathname: string;
  onNavigate?: () => void;
}) {
  const byParent = React.useMemo(() => {
    const m = new Map<string | null, SidebarCategory[]>();
    for (const c of categories) {
      const k = c.parentId ?? null;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(c);
    }
    return m;
  }, [categories]);

  const byId = React.useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );

  const activeSlug = pathname.startsWith("/c/")
    ? decodeURIComponent(pathname.slice(3).split("/")[0] ?? "")
    : null;

  /* 当前分类的所有上级 —— 这些必须展开，否则当前页在侧栏里看不见 */
  const activeAncestors = React.useMemo(() => {
    const set = new Set<string>();
    const target = categories.find((c) => c.slug === activeSlug);
    let cur = target?.parentId ?? null;
    let guard = 0;
    while (cur && guard++ < 32) {
      set.add(cur);
      cur = byId.get(cur)?.parentId ?? null;
    }
    return set;
  }, [categories, activeSlug, byId]);

  const [expanded, setExpanded] = React.useState<Set<string>>(
    () => new Set(activeAncestors),
  );

  /*
   * 路由变化时把新路径的上级补进展开集合。
   * 只加不删：用户手动展开的那些不该被一次跳转全收回去。
   */
  const [previousSlug, setPreviousSlug] = React.useState(activeSlug);
  if (previousSlug !== activeSlug) {
    setPreviousSlug(activeSlug);
    setExpanded((prev) => new Set([...prev, ...activeAncestors]));
  }

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const renderLevel = (parentId: string | null, depth: number): React.ReactNode =>
    (byParent.get(parentId) ?? []).map((c) => {
      const kids = byParent.get(c.id) ?? [];
      const open = expanded.has(c.id);

      return (
        <div key={c.id}>
          <NavRow
            href={`/c/${encodeURIComponent(c.slug)}`}
            active={pathname === `/c/${encodeURIComponent(c.slug)}`}
            icon={iconForCategory(c.name)}
            label={c.name}
            count={c.count}
            depth={depth}
            onNavigate={onNavigate}
            hasChildren={kids.length > 0}
            expanded={open}
            onToggle={() => toggle(c.id)}
          />
          {kids.length > 0 && open ? (
            <div className="mt-0.5 space-y-0.5">{renderLevel(c.id, depth + 1)}</div>
          ) : null}
        </div>
      );
    });

  return <div className="space-y-0.5">{renderLevel(null, 0)}</div>;
}

function Logo({ siteName }: { siteName: string }) {
  return (
    <Link href="/" className="group flex items-center gap-2.5">
      <span
        aria-hidden
        className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-primary text-primary-foreground shadow-[0_2px_8px_-2px_color-mix(in_oklab,var(--primary)_55%,transparent)] transition-transform duration-200 group-hover:scale-[1.04]"
      >
        <Bookmark className="size-[18px]" fill="currentColor" strokeWidth={0} />
      </span>
      <span className="flex min-w-0 flex-col leading-none">
        <span className="truncate text-[17px] font-semibold tracking-tight">
          {siteName}
        </span>
        <span className="mt-1 truncate text-[10.5px] font-normal text-muted-foreground">
          个人书签工作台
        </span>
      </span>
    </Link>
  );
}

function NavRow({
  href,
  active,
  icon: Icon,
  label,
  count,
  depth = 0,
  onNavigate,
  hasChildren = false,
  expanded = false,
  onToggle,
}: {
  href: string;
  active: boolean;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count?: number;
  /** 子分类缩进层级 */
  depth?: number;
  onNavigate?: () => void;
  /** 有子分类时右侧显示展开按钮 */
  hasChildren?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
}) {
  return (
    /*
     * 行本身是 div，里面拆成「链接 + 展开按钮」两半。
     * 之前整行就是一个 <Link>，加折叠按钮后点箭头会跟着跳转 ——
     * 想展开子分类，结果人已经被带到那个分类页了。
     */
    <div
      className={cn(
        "group relative flex h-10 items-center rounded-lg text-[13px] transition-colors duration-150",
        active
          ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
          : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground",
      )}
    >
      <Link
        href={href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className="flex min-w-0 flex-1 items-center gap-2.5 self-stretch rounded-lg pe-1"
        style={{ paddingInlineStart: 12 + depth * 14 }}
      >
        <Icon
          className={cn(
            "shrink-0 transition-transform duration-200",
            depth > 0 ? "size-[13px] opacity-70" : "size-[15px]",
            !active && "group-hover:scale-110",
          )}
        />
        <span className="flex-1 truncate">{label}</span>
        {typeof count === "number" && count > 0 ? (
          <span className="shrink-0 font-mono text-[10.5px] tabular-nums opacity-55">
            {pad(count)}
          </span>
        ) : null}
      </Link>

      {hasChildren ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-label={`${expanded ? "收起" : "展开"} ${label} 的子分类`}
          className="me-1 flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
        >
          <ChevronRight
            className={cn(
              "size-3.5 transition-transform duration-200",
              expanded && "rotate-90",
            )}
          />
        </button>
      ) : (
        <span className="pe-2.5" aria-hidden />
      )}
    </div>
  );
}

export function SidebarBody({
  siteName,
  siteTagline,
  total,
  categories,
  isAdmin,
  categoryOptions = [],
  onNavigate,
}: {
  siteName: string;
  siteTagline: string;
  total: number;
  categories: SidebarCategory[];
  isAdmin: boolean;
  categoryOptions?: CategoryOption[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const isHome = pathname === "/";

  return (
    <div className="flex h-full flex-col px-4 py-5">
      <div className="px-1">
        <Logo siteName={siteName} />
      </div>

      <div className="mt-6 flex items-center gap-3 rounded-[10px] border border-sidebar-border bg-card px-3 py-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-indigo-soft text-indigo-ink"><Bookmark className="size-4" aria-hidden /></span>
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold">我的数字空间</p>
          <p className="truncate text-[11px] text-muted-foreground">个人书签工作台</p>
        </div>
      </div>
      <nav aria-label="主导航" className="mt-5 space-y-0.5">
        <NavRow
          href="/"
          active={isHome}
          icon={LayoutGrid}
          label="全部书签"
          count={total}
          onNavigate={onNavigate}
        />
        {total > 0 && <NavRow href="/#quick-tools" active={false} icon={Star} label="常用入口" onNavigate={onNavigate} />}
        <NavRow href="/#recent-bookmarks" active={false} icon={Clock3} label="最近收藏" onNavigate={onNavigate} />
      </nav>

      <div className="my-4 border-t border-sidebar-border" />

      {/* 分类导航 */}
      <nav
        aria-label="分类导航"
        className="min-h-0 flex-1 overflow-y-auto no-scrollbar"
      >
        <p className="mb-1.5 px-3 text-[10.5px] font-medium tracking-wide text-muted-foreground/70">
          我的分类
        </p>
        <div className="space-y-0.5">
          <CategoryTree
            categories={categories}
            pathname={pathname}
            onNavigate={onNavigate}
          />
        </div>

        {isAdmin && !onNavigate && <NewCategoryDialog categories={categoryOptions} className="mt-2 w-full justify-start" />}
      </nav>

      {/* 底部说明卡片 */}
      <div className="mt-4 rounded-xl border border-sidebar-border bg-sidebar-accent/40 p-3.5">
        <div className="flex items-center gap-1.5 text-[12px] font-medium text-sidebar-accent-foreground">
          <Bookmark className="size-3.5 shrink-0" />
          你的个人书签工作台
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
          {siteTagline || "已同步常用网站，支持搜索、分类与快速访问。"}
        </p>
        {/*
         * 这里原来写的是「查看我的收藏 →」指向 /，也就是当前页自己 ——
         * 点了没有任何变化，是最容易让人以为页面坏了的那种链接。
         * 换成真正能去的地方：登录后进后台，未登录去登录页。
         */}
        {isAdmin ? (
          <Link
            href="/dashboard"
            className="mt-2 inline-flex items-center gap-1 text-[13px] font-medium text-sidebar-accent-foreground transition-opacity hover:opacity-70"
          >
            进入管理后台 →
          </Link>
        ) : (
          <button
            type="button"
            onClick={openLogin}
            className="mt-2 inline-flex items-center gap-1 text-[13px] font-medium text-sidebar-accent-foreground transition-opacity hover:opacity-70"
          >
            登录以管理书签 →
          </button>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between px-1 text-sm text-muted-foreground">
        <div className="flex items-center gap-3">
          {isAdmin ? (
            <Link
              href="/settings"
              className="flex items-center gap-1.5 transition-colors hover:text-foreground"
            >
              <Settings2 className="size-3.5" />
              设置
            </Link>
          ) : (
            <button
              type="button"
              onClick={openLogin}
              className="flex items-center gap-1.5 transition-colors hover:text-foreground"
            >
              <Settings2 className="size-3.5" />
              登录
            </button>
          )}
          <Link
            href="/search"
            className="flex items-center gap-1.5 transition-colors hover:text-foreground"
          >
            <Search className="size-3.5" />
            搜索
          </Link>
        </div>
        <a href={PROJECT_GITHUB_URL} target="_blank" rel="noopener noreferrer" aria-label="GitHub 仓库" title="GitHub 仓库" className="grid size-9 place-items-center rounded-lg hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-2 focus-visible:outline-ring"><svg className="size-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden><path d="M8 0a8 8 0 0 0-2.53 15.59c.4.07.55-.17.55-.38l-.01-1.49c-2.23.48-2.7-.95-2.7-.95-.36-.93-.89-1.18-.89-1.18-.73-.5.06-.49.06-.49.81.06 1.23.83 1.23.83.71 1.22 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.01.08-2.12 0 0 .67-.22 2.2.82a7.65 7.65 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.11.16 1.92.08 2.12.51.56.82 1.28.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48l-.01 2.21c0 .21.14.46.55.38A8 8 0 0 0 8 0Z" /></svg></a>
      </div>
    </div>
  );
}

/** 移动端抽屉 */
export function MobileSidebar({
  open,
  onClose,
  ...body
}: {
  open: boolean;
  onClose: () => void;
  siteName: string;
  siteTagline: string;
  total: number;
  categories: SidebarCategory[];
  isAdmin: boolean;
}) {
  return (
    <Drawer.Root open={open} onOpenChange={(value) => { if (!value) onClose(); }}>
      <Drawer.Portal>
        <Drawer.Overlay className="mobile-nav-overlay fixed inset-0 z-50 bg-black/45 backdrop-blur-sm lg:hidden" />
        <Drawer.Content
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            const trigger = document.querySelector<HTMLButtonElement>('[aria-label="打开菜单"]');
            if (trigger?.getClientRects().length) { event.preventDefault(); trigger.focus(); }
          }}
          className="mobile-nav-drawer fixed inset-y-0 start-0 z-50 w-[17rem] max-w-[85vw] overflow-y-auto border-e border-sidebar-border bg-sidebar shadow-2xl outline-none lg:hidden"
        >
          <Drawer.Title className="sr-only">分类导航</Drawer.Title>
          <Drawer.Close aria-label="关闭菜单" className="absolute end-2 top-2 z-10 flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"><X className="size-4" /></Drawer.Close>
          <SidebarBody {...body} onNavigate={onClose} />
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
