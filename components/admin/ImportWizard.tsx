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
  const [applySettings, setApplySettings] = React.useState(false);
  const [preserveVisibility, setPreserveVisibility] = React.useState(false);
  const [done, setDone] = React.useState<ImportState>(null);
  const [busy, setBusy] = React.useState(false);
  const [file, setFile] = React.useState<File | null>(null);
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const previewRequest = React.useRef(0);

  const preview = state?.preview;
  const step = done?.result ? 2 : preview ? 1 : 0;

  const handleFile = (f: File | undefined) => {
    if (!f) return;
    setFileName(f.name);
    setState(null);
    setDone(null);
    setApplySettings(false);
    setPreserveVisibility(false);
    setMapFolders(true);
    // 只留原始 File，不在这里解码：服务端会嗅探 UTF-8 / GBK
    setFile(f);
  };

  const submitPreview = async (file: File | undefined) => {
    if (!file) return;
    const request = ++previewRequest.current;
    setPending(true);
    setState(null);
    setDone(null);
    const fd = new FormData();
    fd.set("file", file);
    try {
      const res = await previewImport(null, fd);
      if (request === previewRequest.current) setState(res);
    } catch {
      if (request === previewRequest.current) setState({ ok: false, error: "无法预览文件，请重试" });
    } finally {
      if (request === previewRequest.current) setPending(false);
    }
  };

  return (
    <div className="space-y-6">
      <Stepper current={step} />

      {/* 步骤 1 */}
      <section className="rounded-xl border bg-card p-5">
        <h2 className="text-sm font-semibold">选择书签文件</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          支持 iliang nav JSON 书签库、CSV 表格，以及 Chrome / Edge / Firefox / Safari 导出的 HTML。仅合并新数据，不会覆盖已有书签。
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
            if (f && !busy) {
              void handleFile(f);
              void submitPreview(f);
            }
          }}
          onClick={() => { if (!busy) inputRef.current?.click(); }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (!busy && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); inputRef.current?.click(); }
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
            {fileName ?? "拖入 HTML、JSON 或 CSV，或点击选择"}
          </p>
          <p className="text-xs text-muted-foreground">最大 10MB</p>
          <input
            ref={inputRef}
            type="file"
            accept=".html,.htm,.json,.csv,text/html,application/json,text/csv"
            disabled={busy}
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
            disabled={busy || pending || !fileName}
            onClick={() => {
              void submitPreview(file ?? undefined);
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
                将新建 {preview.newFolderCount} 个分类{preview.newFolderCount > preview.newFolders.length ? "（仅显示前 50 个）" : ""}
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
              disabled={busy}
              onCheckedChange={(v) => setMapFolders(v === true)}
            />
            <Label htmlFor="mapFolders" className="text-sm font-normal">
              按文件夹层级创建分类（不覆盖已有分类）
            </Label>
          </div>

          {preview.format !== "html" && (
            <div className="flex items-start gap-2">
              <Checkbox id="preserveVisibility" checked={preserveVisibility} disabled={busy} onCheckedChange={(v) => setPreserveVisibility(v === true)} />
              <Label htmlFor="preserveVisibility" className="text-sm font-normal">保留文件中的可见性（可能公开新导入的书签；默认私有）</Label>
            </div>
          )}
          {preview.hasSettings && (
            <div className="flex items-start gap-2">
              <Checkbox id="applySettings" checked={applySettings} disabled={busy} onCheckedChange={(v) => setApplySettings(v === true)} />
              <Label htmlFor="applySettings" className="text-sm font-normal">导入尚未配置的站点展示设置（不覆盖已有设置）</Label>
            </div>
          )}

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
            disabled={busy || !file || (!preview.willCreate && !(mapFolders && preview.newFolderCount) && !applySettings)}
            onClick={async () => {
              if (!file) return;
              setBusy(true);
              const fd = new FormData();
              fd.set("file", file);
              fd.set("mapFolders", String(mapFolders));
              fd.set("applySettings", String(applySettings));
              fd.set("preserveVisibility", String(preserveVisibility));
              fd.set("digest", state?.digest ?? "");
              try {
                const r = await confirmImport(null, fd);
                setDone(r);
                if (r?.ok) setState(null);
              } catch {
                setDone({ ok: false, error: "无法确认导入结果，请刷新后检查书签列表" });
              } finally { setBusy(false); }
            }}
          >
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                导入中…
              </>
            ) : (
              preview.willCreate ? `确认导入 ${preview.willCreate} 条` : "确认导入"
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
              ["新增展示设置", done.result.settingsAdded],
            ].map(([label, value]) => (
              <div key={String(label)}>
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="text-xl font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">
            已有书签未被覆盖。可以到书签管理页检查新增条目的可见性。
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
