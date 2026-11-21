"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  DatabaseBackup,
  Download,
  Loader2,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  backupNow,
  removeBackup,
  restoreFromBackup,
  type BackupActionResult,
} from "@/lib/backup/actions";
import type { BackupInfo } from "@/lib/backup/service";

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * 必须显式指定时区。
 *
 * 这是客户端组件，同一段文本会先在服务端渲染、再在浏览器水合。
 * 容器默认 UTC、浏览器是 Asia/Shanghai，不指定时区两边算出的小时数
 * 不一样，React 会判定「文本内容不匹配」直接报 #418。
 */
function fmtTime(sec: number) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai",
  }).format(new Date(sec * 1000));
}

export function BackupPanel({ initial }: { initial: BackupInfo[] }) {
  const router = useRouter();
  const [items, setItems] = React.useState<BackupInfo[]>(initial);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [msg, setMsg] = React.useState<BackupActionResult | null>(null);

  const apply = (res: BackupActionResult) => {
    setMsg(res);
    if (res.backups) setItems(res.backups);
  };

  const run = async (key: string, fn: () => Promise<BackupActionResult>) => {
    setBusy(key);
    setMsg(null);
    try {
      apply(await fn());
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-[12px] leading-relaxed text-muted-foreground">
        使用 SQLite 在线备份接口生成一致性快照（直接复制文件会漏掉 WAL
        里未落盘的数据）。恢复前会自动先备份当前状态。
      </p>

      {items.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
          还没有备份
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {items.map((b) => (
            <li
              key={b.name}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-[12.5px]">{b.name}</p>
                <p className="text-[11.5px] text-muted-foreground">
                  {fmtTime(b.createdAt)} · {fmtSize(b.size)}
                </p>
              </div>

              <div className="flex items-center gap-1">
                <a
                  href={`/api/backup/${encodeURIComponent(b.name)}`}
                  className="flex h-8 items-center gap-1 rounded-md px-2 text-[12px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  title="下载"
                >
                  <Download className="size-3.5" />
                </a>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1 px-2 text-[12px]"
                  disabled={busy !== null}
                  onClick={() => {
                    const ok = window.confirm(
                      `用「${b.name}」覆盖当前数据？\n\n当前数据会先自动备份一份，恢复错了可以再退回来。`,
                    );
                    if (!ok) return;
                    void run(b.name, () => restoreFromBackup(b.name)).then(() => router.refresh());
                  }}
                  title="恢复到此备份"
                >
                  {busy === b.name ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="size-3.5" />
                  )}
                  恢复
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-[12px] text-muted-foreground hover:text-destructive"
                  disabled={busy !== null}
                  onClick={() => {
                    if (!window.confirm(`删除备份「${b.name}」？`)) return;
                    void run(b.name, () => removeBackup(b.name));
                  }}
                  title="删除"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {msg?.error ? (
        <p className="flex items-start gap-1.5 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {msg.error}
        </p>
      ) : null}

      {msg?.ok && msg.name ? (
        <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
          已生成备份 {msg.name}
        </p>
      ) : null}

      {msg?.ok && msg.safety ? (
        <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
          已恢复。恢复前的数据存为 {msg.safety}
        </p>
      ) : null}

      <div>
        <Button
          type="button"
          size="sm"
          className="gap-1.5"
          disabled={busy !== null}
          onClick={() => void run("__new__", () => backupNow())}
        >
          {busy === "__new__" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <DatabaseBackup className="size-4" />
          )}
          立即备份
        </Button>
      </div>
    </div>
  );
}
