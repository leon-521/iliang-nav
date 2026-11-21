"use client";

import * as React from "react";
import { Bookmark, CheckCircle2 } from "lucide-react";
import { BookmarkDialog } from "@/components/admin/BookmarkForm";
import type { CategoryOption } from "@/lib/categories/service";

/**
 * 书签小工具落地页。
 *
 * 独立一页、不套后台侧栏：它是从一个 520×640 的小窗口打开的，
 * 侧栏挤进去就没地方了。页面一进来就把弹窗打开，地址和标题
 * 已经由书签脚本带过来，用户只需要选分类、按保存。
 */
export function QuickAddPanel({
  categories,
  initialUrl,
  initialTitle,
}: {
  categories: CategoryOption[];
  initialUrl: string;
  initialTitle: string;
}) {
  const [saved, setSaved] = React.useState(false);

  if (saved) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background p-6">
        <div className="w-full max-w-sm text-center animate-fade-up">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <CheckCircle2 className="size-5" />
          </div>
          <h1 className="text-lg font-semibold">已收藏</h1>
          <p className="mt-1.5 text-[13px] text-muted-foreground">
            这个页面已经进你的书签了，窗口可以关掉。
          </p>

          <div className="mt-5 flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => window.close()}
              className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              关闭窗口
            </button>
            <a
              href="/dashboard"
              className="inline-flex h-9 items-center rounded-lg border border-border px-4 text-[13px] transition-colors hover:bg-secondary"
            >
              去后台
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Bookmark className="size-5" />
        </div>
        <h1 className="text-lg font-semibold">收藏这个页面</h1>
        <p className="mt-1.5 break-all text-[12.5px] text-muted-foreground">
          {initialTitle || initialUrl || "没有拿到地址，手动填一下"}
        </p>

        <div className="mt-5 flex justify-center">
          <BookmarkDialog
            categories={categories}
            defaultUrl={initialUrl}
            defaultTitle={initialTitle}
            autoOpen
            onSaved={() => setSaved(true)}
            trigger={
              <button
                type="button"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <Bookmark className="size-3.5" />
                打开收藏窗口
              </button>
            }
          />
        </div>
      </div>
    </div>
  );
}
