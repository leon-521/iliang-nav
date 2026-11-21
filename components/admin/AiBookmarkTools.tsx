"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { applyAiBookmarks, previewAiBookmark, type AiIntent, type AiPreview } from "@/lib/ai/actions";

// Also enforced by the server for batch writes. Preview calls remain single-item and sequential.
const MAX_BATCH = 8;
const fields = [["title", "标题"], ["description", "简介"], ["categoryId", "分类"], ["tags", "新增标签"]] as const;
type Field = (typeof fields)[number][0];
type Bookmark = { id: string; title: string };
type Outcome = Bookmark & (
  | { preview: AiPreview; error?: never; applied?: { ok: true } | { ok: false; error: string } }
  | { preview?: never; error: string; applied?: never }
);
const statusLabel = { reachable: "可访问", unavailable: "已失效", unknown: "无法确定" } as const;
const reasonLabel = { ok: "网站已响应", not_found: "域名或目标不存在", auth_required: "需要授权或访问被拒绝", rate_limited: "网站限流", server_error: "网站暂时异常", unreachable: "当前网络不可达", network_error: "地址或网络异常", timeout: "请求超时", blocked: "已跳过受限地址" } as const;

export function AiBookmarkTools({ rows }: { rows: Bookmark[] }) {
  const router = useRouter();
  const uid = useId();
  const locked = useRef(false);
  const stop = useRef(false);
  const [intent, setIntent] = useState<AiIntent>("metadata");
  const [query, setQuery] = useState("");
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [allow, setAllow] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [selected, setSelected] = useState<Record<string, Field[]>>({});
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [phase, setPhase] = useState<"idle" | "preview" | "apply">("idle");
  const [current, setCurrent] = useState("");
  const [stopping, setStopping] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean }>();

  // Navigating away must not start more provider requests after the in-flight one finishes.
  useEffect(() => () => { stop.current = true; }, []);

  const pending = phase !== "idle";
  const limit = intent === "link" ? 1 : MAX_BATCH;
  const matched = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    return search ? rows.filter(({ title }) => title.toLocaleLowerCase().includes(search)) : rows;
  }, [query, rows]);
  // Keep the selector usable for large bookmark libraries; search still covers all rows.
  const printable = matched.slice(0, 60);
  const selectedIds = new Set(bookmarks.map(({ id }) => id));
  const entries = outcomes.flatMap((item) => {
    const token = item.preview?.token;
    const choices = selected[item.id];
    return !item.applied && token && choices?.length ? [{ token, fields: choices }] : [];
  });

  function resetResult() {
    setAllow(false);
    setConfirmed(false);
    setSelected({});
    setOutcomes([]);
    setMessage(undefined);
  }

  async function generate() {
    if (locked.current || !allow || !bookmarks.length || bookmarks.length > limit) return;
    locked.current = true;
    stop.current = false;
    setStopping(false);
    resetResult();
    setPhase("preview");
    const batch = [...bookmarks];
    let processed = 0;
    let failures = 0;
    let suggestions = 0;
    try {
      for (const bookmark of batch) {
        if (stop.current) break;
        setCurrent(bookmark.title);
        let outcome: Outcome;
        try {
          const result = await previewAiBookmark(bookmark.id, intent, true);
          outcome = result.ok ? { ...bookmark, preview: result.preview } : { ...bookmark, error: result.error };
        } catch {
          outcome = { ...bookmark, error: "请求失败，请重新登录或稍后再试。" };
        }
        processed++;
        if (outcome.error) failures++;
        if (outcome.preview?.token) suggestions++;
        const result = outcome;
        setOutcomes((prev) => [...prev, result]);
      }
      setMessage({ text: `${processed < batch.length ? "已停止" : "预览完成"}：已处理 ${processed} / ${batch.length} 条，${suggestions} 条有可应用建议，${failures} 条失败。` });
    } finally {
      setCurrent("");
      setPhase("idle");
      locked.current = false;
    }
  }

  async function apply() {
    if (locked.current || !confirmed || !entries.length) return;
    locked.current = true;
    setPhase("apply");
    setMessage(undefined);
    setConfirmed(false);
    try {
      const result = await applyAiBookmarks(entries, true);
      if (!result.ok) {
        setMessage({ text: result.error, error: true });
        return;
      }
      const results = new Map(result.results.map((item) => [item.token, item]));
      setOutcomes((prev) => prev.map((item) => {
        const token = item.preview?.token;
        const applied = token ? results.get(token) : undefined;
        return item.preview && applied ? { ...item, applied } : item;
      }));
      const saved = result.results.filter(({ ok }) => ok).length;
      setMessage({ text: `已更新 ${saved} 条，${result.results.length - saved} 条写入失败。` });
      if (saved) router.refresh();
    } catch {
      setMessage({ text: "无法确认写入结果，请刷新检查书签后重新生成建议。", error: true });
    } finally {
      setPhase("idle");
      locked.current = false;
    }
  }

  return (
    <section aria-label="书签 AI 工具" className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <section aria-labelledby={`${uid}-selection`} className="min-w-0 space-y-4 self-start rounded-xl border bg-card p-4 sm:p-6">
          <h2 id={`${uid}-selection`} className="text-base font-semibold">选择书签和操作</h2>
          <div className="space-y-2">
            <Label htmlFor={`${uid}-intent`}>操作</Label>
            <select id={`${uid}-intent`} className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-2 focus-visible:outline-ring" value={intent} disabled={pending} onChange={(event) => {
              const next = event.target.value as AiIntent;
              setIntent(next);
              if (next === "link" && bookmarks.length > 1) setBookmarks([]);
              resetResult();
            }}>
              <option value="metadata">AI 补全缺失标题和简介</option><option value="all">AI 网页摘要、标签与分类</option><option value="category">AI 智能分类</option><option value="link">AI 辅助链接检测（单条）</option>
            </select>
          </div>
          <fieldset className="min-w-0 space-y-2" disabled={pending}>
            <legend className="text-sm font-medium">选择书签（已选 {bookmarks.length} / {limit} 条）</legend>
            <Input type="search" aria-label="筛选书签" placeholder="按标题筛选书签" value={query} onChange={(event) => setQuery(event.target.value)} />
            {bookmarks.length > 0 && <div className="flex flex-wrap gap-1.5" aria-label="已选书签">
              {bookmarks.map((bookmark) => <Button key={bookmark.id} className="max-w-full" size="xs" variant="secondary" type="button" aria-label={`取消选择 ${bookmark.title}`} onClick={() => {
                setBookmarks((prev) => prev.filter(({ id }) => id !== bookmark.id)); resetResult();
              }}><span className="truncate">{bookmark.title}</span><span aria-hidden>×</span></Button>)}
            </div>}
            <div className="max-h-72 overflow-y-auto rounded-lg border p-2">
              {printable.map((bookmark) => {
                const checked = selectedIds.has(bookmark.id);
                const controlId = `${uid}-bookmark-${bookmark.id}`;
                return <div key={bookmark.id} className="flex min-h-8 items-center gap-2 px-1">
                  <Checkbox id={controlId} checked={checked} disabled={pending || (!checked && bookmarks.length >= limit)} onCheckedChange={(value) => {
                    setBookmarks((prev) => value === true ? prev.length < limit && !prev.some(({ id }) => id === bookmark.id) ? [...prev, bookmark] : prev : prev.filter(({ id }) => id !== bookmark.id));
                    resetResult();
                  }} />
                  <Label htmlFor={controlId} className="block min-w-0 truncate py-2" title={bookmark.title}>{bookmark.title}</Label>
                </div>;
              })}
              {!matched.length && <p className="p-2 text-sm text-muted-foreground">没有匹配的书签。</p>}
            </div>
            {matched.length > printable.length && <p className="text-xs text-muted-foreground">仅显示前 {printable.length} 条匹配结果，请继续筛选。</p>}
          </fieldset>
          <div className="flex items-start gap-2">
            <Checkbox id={`${uid}-send`} checked={allow} onCheckedChange={(value) => setAllow(value === true)} disabled={pending} />
            <Label htmlFor={`${uid}-send`} className="leading-snug">{intent === "link" ? "允许访问此书签链接，并将探测结果（不含网址）发送给供应商解释" : `允许服务器访问所选书签的当前网址，并将网页标题、域名和正文节选${intent === "metadata" ? "" : "及候选分类"}发送给已配置的 AI 供应商（可能包含敏感信息）`}</Label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" disabled={!allow || !bookmarks.length || pending} onClick={generate}>{phase === "preview" ? "正在生成…" : "生成预览"}</Button>
            {phase === "preview" && intent !== "link" && <Button type="button" variant="outline" disabled={stopping} onClick={() => { stop.current = true; setStopping(true); }}>{stopping ? "将在当前条目结束后停止" : "停止后续预览"}</Button>}
          </div>
      </section>
      <section aria-labelledby={`${uid}-preview`} className="min-w-0 space-y-4 self-start rounded-xl border bg-card p-4 sm:p-6">
          <h2 id={`${uid}-preview`} className="text-base font-semibold">预览与应用</h2>
          {!outcomes.length && !pending && !message && (
            <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">选好书签后，点击「生成预览」在这里审阅建议。</p>
          )}
          {phase === "preview" && <div className="space-y-1 text-sm" role="status">
            <p>已处理 {outcomes.length} / {bookmarks.length} 条{current && ` · 正在处理 ${current}`}</p>
            <progress className="h-2 w-full accent-primary" value={outcomes.length} max={bookmarks.length} aria-label="预览进度" />
          </div>}
          {outcomes.length > 0 && <section aria-label="逐条预览与结果" className="space-y-2">
            <p className="text-sm font-medium">逐条结果 · 建议默认不勾选；摘要可能替换原简介，标签只追加</p>
            {outcomes.map((item) => {
              const { preview, applied } = item;
              const evidence = preview?.evidence;
              return <article key={item.id} className="space-y-2 rounded-lg border p-3 text-sm">
                <h3 className="break-words font-semibold">{item.title}</h3>
                {item.error && <p className="text-destructive">{item.error}</p>}
                {evidence && <div className="space-y-1" aria-label="实际探测结果">
                  <p><strong>实际探测：{statusLabel[evidence.result]}</strong>{evidence.status !== null && ` · HTTP ${evidence.status}`}</p>
                  <p className="text-muted-foreground">{reasonLabel[evidence.reason]}。结果由服务器探测，不会更新失效标记。</p>
                  {preview.note && <p className="break-words">AI 解读（仅供参考）：{preview.note}</p>}
                  {preview.advisoryError && <p className="text-muted-foreground">AI 解读未返回：{preview.advisoryError}</p>}
                </div>}
                {preview && !preview.token && !evidence && <p className="text-muted-foreground">没有可应用的建议，未修改书签。</p>}
                {applied && <p className={applied.ok ? "text-muted-foreground" : "text-destructive"}>{applied.ok ? "已应用所选字段。" : `写入失败：${applied.error}`}</p>}
                {preview?.token && !applied && fields.map(([field, label]) => {
                  const value = field === "categoryId" ? preview.values.categoryName : field === "tags" ? preview.values.tags?.join("、") : preview.values[field];
                  if (!value) return null;
                  const controlId = `${uid}-result-${item.id}-${field}`;
                  return <div key={field} className="flex items-start gap-2">
                    <Checkbox id={controlId} checked={selected[item.id]?.includes(field) ?? false} disabled={pending} onCheckedChange={(checked) => {
                      setConfirmed(false);
                      setSelected((prev) => {
                        const old = prev[item.id] ?? [];
                        return { ...prev, [item.id]: checked === true ? [...old.filter((key) => key !== field), field] : old.filter((key) => key !== field) };
                      });
                    }} />
                    <Label htmlFor={controlId} className="min-w-0 break-words leading-snug">{label}：{value}</Label>
                  </div>;
                })}
              </article>;
            })}
          </section>}
          {outcomes.some(({ preview, applied }) => preview?.token && !applied) && <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
            <div className="flex items-start gap-2">
              <Checkbox id={`${uid}-apply`} checked={confirmed} disabled={!entries.length || pending} onCheckedChange={(value) => setConfirmed(value === true)} />
              <Label htmlFor={`${uid}-apply`} className="leading-snug">确认只将已勾选的字段写入所选书签，不会放宽原有公开范围。</Label>
            </div>
            <Button type="button" disabled={!entries.length || !confirmed || pending} onClick={apply}>{phase === "apply" ? "正在应用…" : `应用已选字段（${entries.length} 条）`}</Button>
          </div>}
          {message && <p role={message.error ? "alert" : "status"} className={`text-sm ${message.error ? "text-destructive" : "text-muted-foreground"}`}>{message.text}</p>}
      </section>
    </section>
  );
}
