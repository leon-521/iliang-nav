"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { useBookmarklet } from "@/lib/public/bookmarklet";

/**
 * 一键收藏书签脚本。
 *
 * 不装扩展也能用：把下面这个按钮拖到浏览器书签栏，
 * 以后在任何页面点一下，就带着当前地址和标题打开 /quick-add。
 *
 * 标题和图标现在由设置页的手风琴标题栏提供
 * （components/admin/settings-section.tsx），
 * 这里只负责内容 —— 原来自带一层带边框的卡片，
 * 收进手风琴后会变成「框里套框」。
 *
 * href 用 ref 在挂载后 setAttribute 写入，不直接写在 JSX 上：
 * React 对 javascript: 协议的 href 会告警（甚至在新版本里拦掉），
 * 而这里恰恰需要它 —— 用 setAttribute 绕过框架这层检查，
 * 效果和手写 HTML 一样。
 */
export function BookmarkletPanel({ baseUrl }: { baseUrl?: string }) {
  const linkRef = React.useRef<HTMLAnchorElement>(null);
  const [copied, setCopied] = React.useState(false);
  /*
   * 脚本只在 lib/public/bookmarklet.ts 里拼一次，
   * 前台顶栏的弹窗（components/public/bookmarklet-dialog.tsx）也用同一个 hook，
   * 避免两处地址拼得不一样。
   */
  const code = useBookmarklet(baseUrl);

  React.useEffect(() => {
    if (code) linkRef.current?.setAttribute("href", code);
  }, [code]);

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
    <div className="space-y-3">
      <p className="text-[12.5px] leading-relaxed text-muted-foreground">
        把下面这个按钮拖到浏览器书签栏。以后在任何网页点它，
        它会带入网址、标题、网页提供的简介和你手动选中的一小段文字，不读取 Cookie 或整页正文。请先审阅再保存；刷新收藏页会丢失草稿。已安装旧脚本的用户，请重新添加书签。
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <a
          ref={linkRef}
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
    </div>
  );
}
