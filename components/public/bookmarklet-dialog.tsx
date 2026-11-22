"use client";

import * as React from "react";
import { Check, Copy, MousePointerClick } from "lucide-react";
import { useBookmarklet } from "@/lib/public/bookmarklet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * 顶栏「一键收藏」。
 *
 * 设置页里那块说明（components/admin/BookmarkletPanel.tsx）要滚到后台才看得到，
 * 而「想存当前这个网页」的念头是在前台浏览时冒出来的，
 * 所以把这个入口放到顶栏，跟「新增书签」挨着。
 *
 * 脚本本身只在 lib/public/bookmarklet.ts 里生成一次，
 * 这里和设置页共用，避免两处地址拼得不一样。
 */
export function BookmarkletButton({ baseUrl }: { baseUrl?: string }) {
  const [open, setOpen] = React.useState(false);
  const code = useBookmarklet(baseUrl);
  const linkRef = React.useRef<HTMLAnchorElement>(null);
  const [copied, setCopied] = React.useState(false);

  /*
   * React 对 javascript: 协议的 href 会告警（新版本里甚至直接拦掉），
   * 而书签脚本恰恰需要它 —— 用 setAttribute 写进去，效果和手写 HTML 一样。
   *
   * 用 ref 回调而不是 useEffect：弹窗内容是 Radix 按需挂载的，
   * effect 触发时节点可能还没进 DOM，写了个 null 就再也不会重跑。
   */
  const attach = React.useCallback(
    (el: HTMLAnchorElement | null) => {
      linkRef.current = el;
      if (el && code) el.setAttribute("href", code);
    },
    [code],
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label="一键收藏"
          title="一键收藏：拖到书签栏"
          className="flex size-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
        >
          <MousePointerClick className="size-3.5" />
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>一键收藏</DialogTitle>
          <DialogDescription>
            把下面这个按钮拖到浏览器书签栏。以后在任何网页点它，
            它会带入网址、标题、网页提供的简介和你手动选中的一小段文字，不读取 Cookie 或整页正文。请先审阅再保存；刷新收藏页会丢失草稿。已安装旧脚本的用户，请重新添加书签。
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <a
            ref={attach}
            draggable
            onClick={(e) => e.preventDefault()}
            className="inline-flex h-9 cursor-grab items-center gap-1.5 rounded-lg bg-primary px-4 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 active:cursor-grabbing"
          >
            收藏到 iLiang
          </a>
          <button
            type="button"
            onClick={copy}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-[12.5px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            {copied ? (
              <Check className="size-3.5 text-primary" />
            ) : (
              <Copy className="size-3.5" />
            )}
            {copied ? "已复制" : "复制代码"}
          </button>
        </div>

        <p className="text-[11.5px] leading-relaxed text-muted-foreground">
          复制代码的话：新建一个书签，名称随便填，地址粘贴进去即可。
        </p>
      </DialogContent>
    </Dialog>
  );
}
