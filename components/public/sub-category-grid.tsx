import Link from "next/link";
import { createElement } from "react";
import { ChevronRight } from "lucide-react";
import { iconForCategory } from "./nav-icons";
import type { PublicSubCategory } from "@/lib/public/service";

/**
 * 分类页顶部的子分类入口。
 *
 * 存在的理由：顶层分类下面挂着子分类时，如果把整棵子树的书签摊平，
 * 页面上就是一堆来源不明的卡片。给每个子分类一张入口卡，
 * 一眼能看出「这个大类下面分了哪几块、各有多少」。
 */
export function SubCategoryGrid({ items }: { items: PublicSubCategory[] }) {
  if (items.length === 0) return null;

  return (
    <section className="mb-7">
      <div className="mb-2.5 flex items-baseline justify-between">
        <h2 className="text-[15px] font-semibold">子分类</h2>
        <span className="text-[11.5px] text-muted-foreground/70">
          共 {items.length} 个
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((c) => {
          const icon = iconForCategory(c.name);
          return (
            <Link
              key={c.id}
              href={`/c/${encodeURIComponent(c.slug)}`}
              className="group flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-3 transition hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-sm focus-visible:border-accent focus-visible:outline-none"
            >
              <span
                aria-hidden
                className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
              >
                {createElement(icon, { className: "size-4.5" })}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium leading-snug">
                  {c.name}
                </span>
                <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                  {c.count} 个
                  {c.childCount > 0 ? ` · ${c.childCount} 子类` : "书签"}
                </span>
              </span>

              <ChevronRight className="size-4 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-primary" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}
