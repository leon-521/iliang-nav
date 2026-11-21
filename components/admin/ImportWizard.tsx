"use client";

import * as React from "react";
import {
  CheckCircle2,
  FileUp,
  Loader2,
  Upload,
} from "lucide-react";
import {
  confirmImport,
  previewImport,
  type ImportState,
} from "@/lib/import/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

const STEPS = ["选择文件", "确认导入", "完成"] as const;

function Stepper({ current }: { current: number }) {
  return (
    <ol className="flex items-center gap-2 text-sm">
      {STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <React.Fragment key={label}>
            <li className="flex items-center gap-2">
              <span
                className={cn(
                  "flex size-6 items-center justify-center rounded-full border text-xs font-medium tabular-nums",
                  done && "border-primary bg-primary text-primary-foreground",
                  active && "border-primary text-foreground",
                  !done && !active && "border-border text-muted-foreground",
                )}
              >
                {done ? <CheckCircle2 className="size-3.5" /> : i + 1}
              </span>
              <span
                className={cn(
                  active ? "font-medium text-foreground" : "text-muted-foreground",
                )}
              >
                {label}
              </span>
            </li>
            {i < STEPS.length - 1 ? (
              <li className="h-px w-6 bg-border" aria-hidden />
            ) : null}
          </React.Fragment>
        );
      })}
    </ol>
  );
}

export function ImportWizard() {
  const [state, setState] = React.useState<ImportState>(null);
  const [pending, setPending] = React.useState(false);
  const [mapFolders, setMapFolders] = React.useState(true);
  const [done, setDone] = React.useState<ImportState>(null);
  const [busy, setBusy] = React.useState(false);
  const [file, setFile] = React.useState<File | null>(null);
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const preview = state?.preview;
  const step = done?.result ? 2 : preview ? 1 : 0;

  const handleFile = (f: File | undefined) => {
    if (!f) return;
    setFileName(f.name);
    // 只留原始 File，不在这里解码：服务端会嗅探 UTF-8 / GBK
    setFile(f);
  };

  const submitPreview = async (file: File | undefined) => {
    if (!file) return;
    setPending(true);
    const fd = new FormData();
    fd.set("file", file);
    const res = await previewImport(null, fd);
    setState(res);
    setPending(false);
  };

  return (
    <div className="space-y-6">
      <Stepper current={step} />

      {/* 步骤 1 */}
      <section className="rounded-xl border bg-card p-5">
        <h2 className="text-sm font-semibold">选择书签文件</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          浏览器导出：书签管理器 → 导出书签 → HTML。支持 Chrome / Edge / Firefox /
          Safari。
        </p>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files?.[0];
            if (f) {
              void handleFile(f);
              void submitPreview(f);
            }
          }}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
          }}
          className={cn(
            "mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center transition",
            dragging
              ? "border-primary bg-primary/5"
              : "border-border hover:border-muted-foreground/40 hover:bg-muted/40",
          )}
        >
          <div className="flex size-10 items-center justify-center rounded-full bg-muted">
            <FileUp className="size-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">
            {fileName ?? "拖入 HTML 文件，或点击选择"}
          </p>
          <p className="text-xs text-muted-foreground">最大 10MB</p>
          <input
            ref={inputRef}
            type="file"
            accept=".html,.htm,text/html"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              void handleFile(f);
              void submitPreview(f);
            }}
          />
        </div>

        <div className="mt-3 flex items-center gap-2">
          <Button
            size="sm"
            disabled={pending || !fileName}
            onClick={() => {
              const f = inputRef.current?.files?.[0];
              void submitPreview(f);
            }}
          >
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                解析中…
              </>
            ) : (
              <>
                <Upload className="size-4" />
                解析并预览
              </>
            )}
          </Button>
          {state?.error ? (
            <p className="text-sm text-destructive">{state.error}</p>
          ) : null}
        </div>
      </section>

      {/* 步骤 2 */}
      {preview ? (
        <section className="space-y-4 rounded-xl border bg-card p-5">
          <h2 className="text-sm font-semibold">确认导入</h2>

          <div className="grid gap-3 sm:grid-cols-4">
            {[
              { label: "文件内条目", value: preview.total },
              { label: "将新增", value: preview.willCreate, accent: true },
              { label: "重复跳过", value: preview.duplicates },
              { label: "无效链接", value: preview.invalid },
            ].map((s) => (
              <div key={s.label} className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">{s.label}</div>
                <div
                  className={cn(
                    "mt-0.5 text-2xl font-semibold tabular-nums",
                    s.accent && "text-emerald-600 dark:text-emerald-400",
                  )}
                >
                  {s.value}
                </div>
              </div>
            ))}
          </div>

          {preview.newFolders.length > 0 ? (
            <div>
              <div className="mb-1.5 text-xs font-medium text-muted-foreground">
                将新建 {preview.newFolders.length} 个分类
              </div>
              <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto rounded-lg bg-muted/50 p-2.5">
                {preview.newFolders.map((f) => (
                  <Badge key={f} variant="secondary" className="font-normal">
                    {f}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex items-center gap-2">
            <Checkbox
              id="mapFolders"
              checked={mapFolders}
              onCheckedChange={(v) => setMapFolders(v === true)}
            />
            <Label htmlFor="mapFolders" className="text-sm font-normal">
              按文件夹层级自动创建分类（最多 3 级）
            </Label>
          </div>

          <div className="max-h-72 overflow-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>书签</TableHead>
                  <TableHead className="w-44">文件夹</TableHead>
                  <TableHead className="w-20 text-end">状态</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.sample.map((s, i) => (
                  <TableRow key={`${s.url}-${i}`}>
                    <TableCell className="max-w-0">
                      <div className="truncate text-sm font-medium">
                        {s.title}
                      </div>
                      <div className="truncate font-mono text-xs text-muted-foreground">
                        {s.url}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {s.folderPath.join(" / ") || "—"}
                    </TableCell>
                    <TableCell className="text-end">
                      {s.invalid ? (
                        <Badge
                          variant="outline"
                          className="border-transparent bg-destructive/10 text-destructive"
                        >
                          无效
                        </Badge>
                      ) : s.duplicate ? (
                        <Badge
                          variant="outline"
                          className="border-transparent bg-amber-500/12 text-amber-700 dark:text-amber-400"
                        >
                          重复
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="border-transparent bg-emerald-500/12 text-emerald-700 dark:text-emerald-400"
                        >
                          新增
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <Button
            disabled={busy || !file || preview.willCreate === 0}
            onClick={async () => {
              if (!file) return;
              setBusy(true);
              const fd = new FormData();
              fd.set("file", file);
              fd.set("mapFolders", String(mapFolders));
              const r = await confirmImport(null, fd);
              setDone(r);
              setBusy(false);
            }}
          >
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                导入中…
              </>
            ) : (
              `确认导入 ${preview.willCreate} 条`
            )}
          </Button>
        </section>
      ) : null}

      {/* 步骤 3 */}
      {done?.result ? (
        <section className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="size-4" />
            导入完成
          </h2>
          <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["新增书签", done.result.created],
              ["跳过重复", done.result.skipped],
              ["无效链接", done.result.invalid],
              ["新建分类", done.result.foldersCreated],
            ].map(([label, value]) => (
              <div key={String(label)}>
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="text-xl font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">
            导入的书签默认是「私有」，确认无误后到书签页批量设为公开。
          </p>
        </section>
      ) : null}

      {done?.error ? (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {done.error}
        </p>
      ) : null}
    </div>
  );
}
