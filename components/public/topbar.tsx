"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { LayoutDashboard, LogOut, Menu, Search } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Breadcrumbs, type Crumb } from "@/components/layout/breadcrumbs";
import { AddBookmarkButton } from "./quick-edit";
import { BookmarkletButton } from "./bookmarklet-dialog";
import { MobileSidebar, type SidebarCategory } from "./nav-sidebar";
import { openLogin } from "@/lib/public/login-bus";
import type { CategoryOption } from "@/lib/public/service";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
export function SiteSearch({ initialQuery, mobilePage = false }: { initialQuery: string; mobilePage?: boolean }) {
  const router = useRouter();
  const input = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.defaultPrevented || event.isComposing || event.ctrlKey || event.altKey || event.metaKey) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]') || (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]'))) return;
      if (!input.current?.getClientRects().length) return;
      event.preventDefault();
      input.current.focus();
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);

  return (
    <form role="search" action="/search" method="get" onSubmit={(event) => {
      event.preventDefault();
      const query = input.current?.value.trim() ?? "";
      router.push(query ? `/search?q=${encodeURIComponent(query)}` : "/search");
    }} className={`min-w-0 items-center gap-2 rounded-lg border border-input bg-card px-2.5 focus-within:ring-2 focus-within:ring-ring/40 ${mobilePage ? "flex w-full lg:hidden" : "ms-auto hidden max-w-sm flex-1 lg:flex"}`}>
      <Search className="hidden size-4 shrink-0 text-muted-foreground sm:block" aria-hidden />
      <input ref={input} type="search" name="q" aria-label="搜索" placeholder="站内搜索" defaultValue={initialQuery} className="h-9 w-full min-w-0 bg-transparent text-base outline-none placeholder:text-muted-foreground sm:text-sm" />
      <kbd className="hidden rounded border px-1.5 text-xs text-muted-foreground lg:inline" aria-hidden>/</kbd>
      <button type="submit" aria-label="提交搜索" className="shrink-0 rounded-md px-1.5 py-1 text-xs font-medium text-primary hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring"><Search className="size-4 sm:hidden" aria-hidden /><span className="hidden sm:inline">搜索</span></button>
    </form>
  );
}

export function Topbar({
  siteName,
  siteTagline,
  total,
  categories,
  isAdmin,
  avatarLabel,
  crumb,
  crumbParents,
  categoryOptions = [],
  baseUrl,
  searchQuery = "",
}: {
  siteName: string;
  siteTagline: string;
  total: number;
  categories: SidebarCategory[];
  isAdmin: boolean;
  avatarLabel: string;
  /** 当前页名（分类页传分类名，其余按路由推断） */
  crumb?: string;
  /** 多级分类的上级路径，由分类页传入，否则只能显示到一级 */
  crumbParents?: Crumb[];
  /** 前台弹窗里分类下拉框的选项 */
  categoryOptions?: CategoryOption[];
  /** 生成「一键收藏」书签脚本用的站点绝对地址 */
  baseUrl?: string;
  searchQuery?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();

  /*
   * 面包屑按真实路径拼，而不是「首页 + 站点副标题」。
   *
   * 之前那一段副标题（「我的书签导航」）长得像路径的一部分，
   * 但它是站点副标题、点了也没反应 —— 用户看到的就是
   * 「书签首页 > 我的书签导航」，以为面包屑没跟着路由走。
   */
  const crumbs = React.useMemo<Crumb[]>(() => {
    const items: Crumb[] = [{ label: "书签首页", href: "/" }];

    if (pathname.startsWith("/c/")) {
      // 上级分类由分类页从 ancestors 传进来，否则只能显示到一级
      for (const p of crumbParents ?? []) items.push(p);
      const leaf =
        crumb ?? decodeURIComponent(pathname.slice(3).split("/")[0] ?? "");
      if (leaf) items.push({ label: leaf });
    } else if (pathname.startsWith("/search")) {
      items.push({ label: "搜索" });
    } else if (pathname.startsWith("/login")) {
      items.push({ label: "登录" });
    }

    return items;
  }, [pathname, crumb, crumbParents]);

  return (
    <>
      <header className="sticky top-0 z-30 flex min-h-14 items-center gap-x-2 border-b border-border bg-background/95 px-4 py-2 backdrop-blur-md sm:min-h-14 sm:flex-nowrap sm:gap-x-3 sm:px-6 lg:h-[76px] lg:px-9">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="打开菜单"
          className="-ms-1 flex size-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground lg:hidden"
        >
          <Menu className="size-5" />
        </button>

        {/*
         * 面包屑按真实路径生成，不再是「书签首页 + 站点副标题」。
         * 之前那一截副标题看起来像路径（「书签首页 我的书签导航」），
         * 但点了没反应、跟当前页也没关系，容易让人以为面包屑坏了。
         */}
        <Breadcrumbs items={crumbs} className="max-w-[18%] shrink sm:max-w-[32%]" />
        <SiteSearch key={`${pathname}:${searchQuery}`} initialQuery={searchQuery} />

        <div className="ms-auto flex shrink-0 items-center gap-1 sm:gap-1.5 lg:ms-0">
          <ThemeToggle className="size-9" />

          {/*
           * 新增书签就地弹窗，不再跳去后台。
           * 原来这个按钮是跳后台书签列表，
           * 只想加个书签却要离开公开站、还得再找一次按钮。
           */}
          {isAdmin && pathname !== "/" ? <AddBookmarkButton categories={categoryOptions} /> : null}

          {/*
           * 「一键收藏」放在「新增书签」旁边。
           * 原来它只藏在后台设置页，而「想存下当前这个网页」的念头
           * 是在前台浏览时冒出来的，不该为它跳去后台。
           */}
          {isAdmin ? <BookmarkletButton baseUrl={baseUrl} /> : null}

          {isAdmin ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="账号菜单"
                  title="账号菜单"
                  className="flex h-9 items-center gap-1.5 rounded-full border border-border bg-card ps-1 pe-2.5 text-[12px] font-medium transition-colors hover:border-primary/40 hover:text-primary data-[state=open]:border-primary/40"
                >
                  <span className="flex size-6 items-center justify-center rounded-full bg-primary text-[10.5px] font-semibold text-primary-foreground">
                    {avatarLabel}
                  </span>
                  {/* 「管理员」是前台判断登录态的可见标记，改文案会让人以为没登上 */}
                  <span className="hidden md:inline">管理员</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
                  已登录
                </DropdownMenuLabel>
                <DropdownMenuItem asChild>
                  <Link href="/dashboard">
                    <LayoutDashboard />
                    管理后台
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {/*
                 * 退出走 /logout 这个 Route Handler，用普通 <a>，不碰 Server Action。
                 *
                 * 试过两条路都不行：
                 *  1. action 里 redirect("/")：退出入口就在首页，重定向到当前
                 *     地址不会重新渲染，菜单照旧开着。
                 *  2. 客户端 await 完再 window.location.assign("/")：菜单项
                 *     一选中 Radix 就卸载子树，transition 里抛 React #441。
                 *
                 * 交给浏览器发一个普通 GET，服务端回 Set-Cookie + 302，
                 * 整页重新加载，状态最干净。
                 */}
                <DropdownMenuItem asChild>
                  <a href="/logout">
                    <LogOut />
                    退出登录
                  </a>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            /*
             * 前后台合并到同一个域名后，登录就地弹窗。
             * 事件由 PublicShell 里的 LoginLauncher 接管，
             * 侧栏、移动端 Tab 栏也能共用同一个弹窗。
             */
            <button
              type="button"
              onClick={() => openLogin()}
              className="flex h-9 items-center rounded-lg px-2.5 text-[12.5px] text-muted-foreground transition-colors hover:text-foreground"
            >
              登录
            </button>
          )}
        </div>
      </header>

      <MobileSidebar
        open={open}
        onClose={() => setOpen(false)}
        siteName={siteName}
        siteTagline={siteTagline}
        total={total}
        categories={categories}
        isAdmin={isAdmin}
      />
    </>
  );
}
