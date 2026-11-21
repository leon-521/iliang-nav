"use client";

import * as React from "react";
import { ChevronDown, Link2 } from "lucide-react";
import { Favicon, displayTitle, hostOf } from "./favicon";
import { safeHref } from "@/lib/public/safe-href";
import type { PublicBookmark } from "@/lib/public/service";

export type GridEntry = { bookmark: PublicBookmark; subName?: string };

/** 每页展示多少个 */
const PAGE_SIZE = 20;

/**
 * 分类页的书签块状网格。
 *
 * 为什么在客户端切片而不是分页请求：
 * 分类下的书签数量是「一个人收藏的网站」这个量级，一次全传过来
 * 比每次点「加载更多」都打一次服务端要快，也不会出现滚动位置跳动。
 * 如果哪天单个分类超过几千条，再换成游标分页。
 */
export function CategoryGrid({
  entries,
  showIcons = true,
}: {
  entries: GridEntry[];
  showIcons?: boolean;
}) {
  const [visible, setVisible] = React.useState(PAGE_SIZE);

  const shown = entries.slice(0, visible);
  const hasMore = entries.length > visible;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
        {shown.map(({ bookmark: b, subName }) => {
          const label = displayTitle(b.title, b.url);
          return (
            /*
             * 外层是 div，不是 a。
             * 有备用链接时要放第二个 <a>，而 HTML 不允许 a 套 a ——
             * 嵌套后浏览器会把内层拆出去，备用入口点了还是跳主站。
             */
            <div
              key={b.id}
              className="group relative flex min-h-[104px] flex-col rounded-xl border border-border bg-card transition hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-sm"
            >
              <a
                href={safeHref(b.url)}
                target="_blank"
                rel="noopener noreferrer"
                title={b.description?.trim() || label}
                className="flex flex-1 flex-col items-center justify-start gap-2 px-2 py-3.5 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
              >
                {showIcons ? (
                  <Favicon
                    title={label}
                    url={b.url}
                    iconUrl={b.iconUrl}
                    iconHidden={b.iconHidden}
                    size={32}
                  />
                ) : (
                  <span className="flex size-8 items-center justify-center rounded-md bg-secondary text-[14px] font-semibold text-muted-foreground">
                    {label.charAt(0).toUpperCase()}
                  </span>
                )}

                <span className="line-clamp-2 w-full text-[12.5px] font-medium leading-snug">
                  {label}
                </span>

                <span className="mt-auto w-full truncate font-mono text-[10.5px] leading-tight text-muted-foreground/70">
                  {hostOf(b.url)}
                </span>

                {subName ? (
                  <span className="max-w-full truncate rounded bg-secondary px-1.5 py-px text-[10px] text-muted-foreground">
                    {subName}
                  </span>
                ) : null}
              </a>

              {b.altUrl ? (
                <a
                  href={safeHref(b.altUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`备用链接：${hostOf(b.altUrl)}`}
                  aria-label={`${label} 的备用链接`}
                  className="absolute end-1.5 top-1.5 flex size-6 items-center justify-center rounded-md text-muted-foreground/35 transition-colors duration-150 hover:bg-secondary hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Link2 className="size-3.5" />
                </a>
              ) : null}
            </div>
          );
        })}
      </div>

      {hasMore ? (
        <div className="flex flex-col items-center gap-1.5 pt-1">
          <button
            type="button"
            onClick={() => setVisible((n) => n + PAGE_SIZE)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-4 text-[12.5px] font-medium transition-colors hover:border-accent/40 hover:bg-secondary focus-visible:border-accent focus-visible:outline-none"
          >
            加载更多
            <ChevronDown className="size-3.5" />
          </button>
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground/60">
            已显示 {shown.length} / {entries.length}
          </span>
        </div>
      ) : entries.length > PAGE_SIZE ? (
        <p className="pt-1 text-center font-mono text-[11px] tabular-nums text-muted-foreground/60">
          共 {entries.length} 个，已全部显示
        </p>
      ) : null}
    </div>
  );
}
