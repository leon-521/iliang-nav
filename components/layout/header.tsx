"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Breadcrumbs, type Crumb } from "./breadcrumbs";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

const LABELS: Record<string, string> = {
  dashboard: "概览",
  bookmarks: "书签",
  categories: "分类",
  import: "导入",
  settings: "设置",
  "ai-tools": "AI 工具",
};

/**
 * 后台顶栏。
 *
 * 面包屑用 components/layout/breadcrumbs.tsx，与前台顶栏同一个组件 ——
 * 之前后台用的是 ui/breadcrumb 原语（text-sm、gap-2.5、ChevronRight 14px），
 * 前台是自己拼的 12.5px 一行，两边字号、间距、分隔符粗细都不一样。
 */
export function Header({ className }: React.HTMLAttributes<HTMLElement>) {
  const pathname = usePathname();
  const [offset, setOffset] = React.useState(0);

  React.useEffect(() => {
    const onScroll = () => setOffset(window.scrollY);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /*
   * 按真实路径逐级生成：「概览 > 分类」。
   * /dashboard 就是「概览」本身，不再拼成「概览 > 概览」。
   */
  const crumbs = React.useMemo<Crumb[]>(() => {
    const segments = pathname.split("/").filter(Boolean);
    const items: Crumb[] = [];

    if (segments.length === 0 || segments[0] === "dashboard") {
      return [{ label: "概览" }];
    }

    items.push({ label: "概览", href: "/dashboard" });
    segments.forEach((seg, i) => {
      const last = i === segments.length - 1;
      items.push({
        label: LABELS[seg] ?? seg,
        href: last ? undefined : "/" + segments.slice(0, i + 1).join("/"),
      });
    });
    return items;
  }, [pathname]);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/85 px-4 backdrop-blur-md transition-shadow duration-200",
        offset > 8 && "shadow-[0_1px_3px_rgba(26,32,43,0.05)]",
        className,
      )}
    >
      <SidebarTrigger className="-ms-1" />
      <Separator orientation="vertical" className="me-1 h-5" />
      <Breadcrumbs items={crumbs} className="shrink-0" />

      <div className="ms-auto flex items-center gap-1">
        <ThemeToggle />
      </div>
    </header>
  );
}
