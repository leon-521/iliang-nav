"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ImageDown, Loader2 } from "lucide-react";
import { refreshMetadataBatch } from "@/lib/metadata/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * 批量补齐图标和简介。
 *
 * 一次请求跑几十条会卡住好几分钟（每条要抓一次目标页面），
 * 期间既看不到进度，也容易被网关超时掐断。所以前端按小批切片、
 * 串行推进，每批回来就更新一次进度条 —— 用户能看见在动，
 * 中途失败也只丢当前这一批。
 */
export function MetadataRefreshButton({
  ids,
  label = "补全图标简介",
  variant = "outline",
  size = "sm",
  className,
}: {
  ids: string[];
  label?: string;
  variant?: "outline" | "ghost" | "default";
  size?: "sm" | "default";
  className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState({ done: 0, total: 0 });
  const [msg, setMsg] = React.useState<string | null>(null);

  /** 每批条数，和 lib/metadata/actions.ts 的 MAX_BATCH 对齐 */
  const CHUNK = 12;

  const run = async () => {
    if (busy || ids.length === 0) return;
    setBusy(true);
    setMsg(null);
    setProgress({ done: 0, total: ids.length });

    let iconFilled = 0;
    let descFilled = 0;
    let skipped = 0;
    let failed = 0;

    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK);
      try {
        const res = await refreshMetadataBatch(chunk);
        if (!res.ok) {
          failed += chunk.length;
        } else {
          iconFilled += res.iconFilled;
          descFilled += res.descFilled;
          skipped += res.skipped;
        }
      } catch {
        /*
         * 部署换容器后旧构建的 action id 会失效（Next 回 409），
         * 这里接住，别让整页崩掉 —— 前面保存书签踩过同一个坑。
         */
        failed += chunk.length;
      }
      setProgress((p) => ({ ...p, done: Math.min(i + CHUNK, ids.length) }));
    }

    const parts = [
      iconFilled > 0 ? `补图标 ${iconFilled}` : null,
      descFilled > 0 ? `补简介 ${descFilled}` : null,
      skipped > 0 ? `抓不到 ${skipped}` : null,
      failed > 0 ? `失败 ${failed}` : null,
    ].filter(Boolean);

    setMsg(parts.length > 0 ? parts.join("，") : "没有需要补的");
    setBusy(false);
    router.refresh();
  };

  const pct =
    progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <Button
        type="button"
        variant={variant}
        size={size}
        className="gap-1.5"
        disabled={busy || ids.length === 0}
        onClick={run}
        title="抓取每个书签的图标和简介，已有的不会被覆盖"
      >
        {busy ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <ImageDown className="size-4" />
        )}
        {busy ? `${progress.done}/${progress.total}` : label}
      </Button>

      {/*
        进度条只在跑的时候出现。用宽度百分比而不是不定长动画：
        用户要的是「还剩多少」，不是「正在转圈」。
      */}
      {busy && progress.total > 0 ? (
        <div className="h-1 w-24 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      ) : null}

      {msg ? (
        <span className="text-[11.5px] text-muted-foreground">{msg}</span>
      ) : null}
    </div>
  );
}
