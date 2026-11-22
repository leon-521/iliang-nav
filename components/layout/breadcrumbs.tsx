"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bookmark, BookOpen, ChevronRight, FileText, Folder, House, Import, LayoutDashboard, LogIn, Search, Settings2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const ROUTE_ICONS = {
  dashboard: LayoutDashboard,
  bookmarks: Bookmark,
  categories: Folder,
  c: Folder,
  import: Import,
  "api-manual": BookOpen,
  search: Search,
  login: LogIn,
  settings: Settings2,
  "ai-tools": Sparkles,
} as const;

function iconForPath(path: string) {
  const section = path.split("/")[1];
  if (!section) return House;
  return Object.hasOwn(ROUTE_ICONS, section) ? ROUTE_ICONS[section as keyof typeof ROUTE_ICONS] : FileText;
}

export type Crumb = {
  label: string;
  /** 最后一级通常不给 href —— 点自己没意义 */
  href?: string;
};

/**
 * 面包屑。
 *
 * 前台顶栏和后台顶栏共用这一个组件，之前两边各写一份：
 * 后台用 ui/breadcrumb 原语（text-sm、gap-2.5），前台是自己拼的
 * 一个链接加一段副标题文字，字号 12.5px，看起来像路径但其实不是 ——
 * 「书签首页 我的书签导航」里的后半截是站点副标题，不是当前页。
 *
 * 现在统一：12.5px、ChevronRight 12px、当前页用 foreground + medium，
 * 其余层级用 muted、可点。
 */
export function Breadcrumbs({
  items,
  className,
}: {
  items: Crumb[];
  className?: string;
}) {
  const pathname = usePathname();
  if (items.length === 0) return null;

  return (
    <nav
      aria-label="面包屑"
      className={cn(
        "flex min-w-0 max-w-[48%] items-center gap-1.5 overflow-hidden text-[12.5px] sm:max-w-[65%]",
        className,
      )}
    >
      {items.map((c, i) => {
        const last = i === items.length - 1;
        const Icon = iconForPath(c.href ?? pathname);
        const icon = <Icon className="size-3.5 shrink-0" aria-hidden="true" />;

        return (
          <span
            key={`${c.href ?? ""}:${c.label}:${i}`}
            className="flex min-w-0 items-center gap-1.5"
          >
            {i > 0 ? (
              <ChevronRight
                className="size-3 shrink-0 text-muted-foreground/40"
                aria-hidden
              />
            ) : null}

            {last || !c.href ? (
              <span
                aria-current={last ? "page" : undefined}
                className={cn(
                  "flex min-w-0 items-center gap-1.5",
                  last
                    ? "font-medium text-foreground"
                    : "text-muted-foreground",
                )}
              >
                {icon}
                <span className="truncate">{c.label}</span>
              </span>
            ) : (
              <Link
                href={c.href}
                className="flex min-w-0 items-center gap-1.5 text-muted-foreground transition-colors hover:text-primary"
              >
                {icon}
                <span className="truncate">{c.label}</span>
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
