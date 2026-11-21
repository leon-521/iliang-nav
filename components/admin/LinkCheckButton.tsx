"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Activity, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { triggerLinkCheck } from "@/lib/links/actions";

/**
 * 手动触发一轮链接检测。
 * 结果就地显示，不弹窗 —— 用户点完还想接着干活。
 */
export function LinkCheckButton({ total }: { total: number }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

  const onClick = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await triggerLinkCheck();
      if (!res.ok) {
        setMsg(res.error ?? "检测失败");
        return;
      }
      const s = res.summary!;
      setMsg(
        s.checked === 0
          ? "没有需要检测的书签"
          : `检测 ${s.checked} 条，失效 ${s.broken}，恢复 ${s.recovered}，用时 ${(s.durationMs / 1000).toFixed(1)}s`,
      );
      router.refresh();
    } catch {
      setMsg("检测失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5"
        disabled={busy || total === 0}
        onClick={onClick}
        title="检查所有书签是否还能打开"
      >
        {busy ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Activity className="size-4" />
        )}
        {busy ? "检测中…" : "检测链接"}
      </Button>
      {msg ? (
        <span className="text-[11.5px] text-muted-foreground">{msg}</span>
      ) : null}
    </div>
  );
}
