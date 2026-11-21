"use client";

import * as React from "react";
import { AlertTriangle, RotateCw } from "lucide-react";

/**
 * 路由级错误兜底。
 *
 * 之前没有这个文件，任何未捕获的渲染错误都会掉进 Next 自带的
 * 「This page couldn't load / Reload to try again, or go back.」——
 * 英文、无样式、没有站点导航，用户第一反应是「站点挂了」。
 *
 * 最常见的触发场景不是真的坏了，而是**部署刚换了容器**：
 * 浏览器里还跑着旧构建的 JS，点保存时 Server Action 的 id
 * 在新服务端已经不存在，请求回 409，客户端直接抛错。
 * 这种情况刷新一次就好，所以这里把「刷新」做成主按钮，
 * 并把话说清楚，而不是让人对着一张报错卡片发愣。
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error("[error-boundary]", error);
  }, [error]);

  return (
    <div className="theme-paper flex min-h-svh items-center justify-center bg-background p-6 text-foreground">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
          <AlertTriangle className="size-5" />
        </div>

        <h1 className="text-lg font-semibold">这个页面没打开</h1>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
          可能是站点刚更新过，你手上还是旧版本。刷新一下通常就好了。
        </p>

        <div className="mt-5 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <RotateCw className="size-3.5" />
            刷新页面
          </button>
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-9 items-center rounded-lg border border-border px-4 text-[13px] transition-colors hover:bg-secondary"
          >
            重试
          </button>
        </div>

        <a
          href="/"
          className="mt-4 inline-block text-[12.5px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          回首页
        </a>

        {error.digest ? (
          <p className="mt-4 font-mono text-[10.5px] text-muted-foreground/60">
            ERROR {error.digest}
          </p>
        ) : null}
      </div>
    </div>
  );
}
