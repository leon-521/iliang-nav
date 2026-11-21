"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, LayoutGrid, Search, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { openLogin } from "@/lib/public/login-bus";

/**
 * 移动端底部 Tab 栏。
 *
 * 设计稿画的是「首页 / 分类 / 最近访问 / 设置」，但本站没有「最近访问」页，
 * 分类也没有独立列表页（分类是按 slug 单独成页的）。
 * 所以这里只放真实可达的入口：分类锚到首页的分类区，
 * 不为了凑数造一个点了没反应的图标。
 */
const TABS = [
  { key: "home", href: "/", label: "首页", icon: Compass },
  { key: "cats", href: "/#categories", label: "分类", icon: LayoutGrid },
  { key: "search", href: "/search", label: "搜索", icon: Search },
] as const;

export function MobileTabbar({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const onCategory = pathname.startsWith("/c/");

  return (
    <nav
      aria-label="移动端导航"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
    >
      <div className="mx-auto flex max-w-md items-stretch">
        {TABS.map(({ key, href, label, icon: Icon }) => {
          const active = key === "home" ? pathname === "/" : key === "cats" ? onCategory : pathname === "/search";

          return (
            <Link
              key={key}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 py-2.5 text-xs transition-colors",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className="size-[18px]" />
              {label}
            </Link>
          );
        })}

        {/*
         * 未登录时这一格是「登录」，点了直接开弹窗；
         * 登录后变成「设置」，进后台设置页。
         */}
        {isAdmin ? (
          <Link
            href="/settings"
            className={cn(
              "flex flex-1 flex-col items-center gap-1 py-2.5 text-xs transition-colors",
              pathname.startsWith("/settings")
                ? "text-primary"
                : "text-muted-foreground",
            )}
          >
            <Settings2 className="size-[18px]" />
            设置
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => openLogin()}
            className="flex flex-1 flex-col items-center gap-1 py-2.5 text-xs text-muted-foreground transition-colors"
          >
            <Settings2 className="size-[18px]" />
            登录
          </button>
        )}
      </div>
    </nav>
  );
}
