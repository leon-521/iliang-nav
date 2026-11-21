"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, BookmarkPlus, Grip, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { BookmarkDialog, type CategoryOption, type EditableBookmark } from "@/components/admin/BookmarkForm";
import { changeQuickTool, saveQuickTools } from "@/lib/settings/actions";
import type { PublicBookmark } from "@/lib/public/service";
import { Button } from "@/components/ui/button";
import { homeBookmarkEditor } from "@/lib/home-actions";
import { deleteBookmarks } from "@/lib/bookmarks/actions";
import { ShortcutMenu } from "./shortcut-menu";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { displayTitle, hostOf } from "./favicon";
import { QuickTools, QuickToolCard, quickToolsGridClass } from "./category-card";

const MAX_QUICK_TOOLS = 12;

/** Homepage container: guest cards are read-only; sorting writes only quick_tool_ids. */
export function HomeQuickTools({ items, showIcons = true, isAdmin, initialIds, candidates, categoryOptions = [] }: {
  items: PublicBookmark[];
  showIcons?: boolean;
  isAdmin: boolean;
  initialIds: string[];
  candidates: PublicBookmark[];
  categoryOptions?: CategoryOption[];
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [editingOrder, setEditingOrder] = React.useState(false);
  const [status, setStatus] = React.useState<{ text: string; error?: boolean } | null>(null);
  const [picker, setPicker] = React.useState(0);
  const [editor, setEditor] = React.useState<{ key: number; data?: EditableBookmark }>();
  const [deleting, setDeleting] = React.useState<PublicBookmark>();
  const locked = React.useRef(false);
  const grid = React.useRef<HTMLDivElement>(null);
  const marker = React.useRef<HTMLElement | null>(null);
  const visible = [...new Map(items.map((item) => [item.id, item])).values()];
  const currentVisible = visible.map(({ id }) => id);
  const canReorder = visible.length > 1;
  const canAdd = (initialIds.length || currentVisible.length) < MAX_QUICK_TOOLS;
  const sorting = editingOrder && canReorder;

  function clearMarker() {
    if (marker.current) delete marker.current.dataset.quickDrop;
    marker.current = null;
  }

  function targetAt(x: number, y: number) {
    const target = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-quick-tool-id]");
    return target && grid.current?.contains(target) ? target : null;
  }

  function run(task: () => Promise<{ ok?: boolean; error?: string } | null>, success: string, failure: string) {
    if (!isAdmin || locked.current) return;
    locked.current = true;
    setStatus(null);
    start(async () => {
      try {
        const result = await task();
        if (!result?.ok) { setStatus({ text: result?.error ?? failure, error: true }); return; }
        setStatus({ text: success });
        router.refresh();
      } catch { setStatus({ text: failure, error: true }); }
      finally { locked.current = false; }
    });
  }

  function reorder(id: string, target: string) {
    if (id !== target) run(() => changeQuickTool({ kind: "move", id, target }), "常用入口顺序已保存。", "排序未保存，请重试。");
  }

  function edit(id: string) {
    if (locked.current) return;
    locked.current = true;
    setStatus(null);
    start(async () => {
      try {
        const data = await homeBookmarkEditor(id);
        if (!data) { setStatus({ text: "书签已不存在。", error: true }); return; }
        setEditor((previous) => ({ key: (previous?.key ?? 0) + 1, data }));
      } catch { setStatus({ text: "无法打开编辑，请重试。", error: true }); }
      finally { locked.current = false; }
    });
  }

  if (!isAdmin && !items.length) return null;

  return (
    <section id="quick-tools" aria-labelledby="quick-tools-title" className="scroll-mt-32">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 id="quick-tools-title" className="font-semibold">常用入口</h2>
        {isAdmin && <div className="flex flex-wrap items-center gap-2">
          {canReorder && <Button type="button" variant="outline" size="sm" aria-pressed={sorting} disabled={pending} onClick={() => setEditingOrder(!editingOrder)}>
            <Grip aria-hidden />{sorting ? "完成排序" : "调整顺序"}
          </Button>}
          <QuickToolsDialog key={picker} autoOpen={picker > 0} initialIds={initialIds.length ? initialIds : currentVisible} candidates={candidates} disabled={pending} />
        </div>}
      </div>
      {sorting && <p className="mb-3 text-xs text-muted-foreground">拖动手柄，或使用前移和后移按钮；每次调整会直接保存。</p>}
      {isAdmin ? <div ref={grid} className={quickToolsGridClass} aria-label={sorting ? "常用入口排序" : "常用入口卡片"} aria-busy={pending}>
        {visible.map((bookmark, index) => {
          const label = displayTitle(bookmark.title, bookmark.url);
          return <div key={bookmark.id} data-quick-tool-id={bookmark.id} className="min-w-0 rounded-[10px] data-[quick-drop=true]:ring-2 data-[quick-drop=true]:ring-primary">
            <ShortcutMenu label={label} commands={[
              { label: "添加已有书签", icon: Plus, disabled: pending, run: () => setPicker((value) => value + 1) },
              { label: "新建书签并加入", icon: BookmarkPlus, disabled: pending || !canAdd, run: () => setEditor((previous) => ({ key: (previous?.key ?? 0) + 1 })) },
              { label: "编辑书签", icon: Pencil, disabled: pending, run: () => edit(bookmark.id) },
              { label: "上移入口", icon: ArrowUp, disabled: pending || index === 0, run: () => reorder(bookmark.id, visible[index - 1].id) },
              { label: "下移入口", icon: ArrowDown, disabled: pending || index >= visible.length - 1, run: () => reorder(bookmark.id, visible[index + 1].id) },
              { label: "仅移除入口", icon: X, disabled: pending, run: () => run(() => changeQuickTool({ kind: "remove", id: bookmark.id }), "已移除常用入口，书签仍保留。", "入口未移除，请重试。") },
              { label: "删除书签", icon: Trash2, destructive: true, disabled: pending, run: () => { setStatus(null); setDeleting(bookmark); } },
            ]}>
              <QuickToolCard bookmark={bookmark} index={index} showIcons={showIcons} />
            </ShortcutMenu>
            {sorting && <div className="mt-1 flex min-w-0 flex-wrap items-center justify-center gap-1">
              <Button type="button" size="icon-sm" variant="ghost" disabled={pending || index === 0} aria-label={`前移 ${label}`} onClick={() => reorder(bookmark.id, visible[index - 1].id)}><ArrowUp aria-hidden /></Button>
              <span title="拖动排序" aria-hidden className="touch-none cursor-grab select-none rounded-md p-2 text-muted-foreground active:cursor-grabbing" onPointerDown={(event) => {
                if (event.button !== 0 || pending || locked.current) return;
                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
              }} onPointerMove={(event) => {
                if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
                const target = targetAt(event.clientX, event.clientY);
                if (target === marker.current) return;
                clearMarker();
                if (target && target.dataset.quickToolId !== bookmark.id) {
                  marker.current = target;
                  target.dataset.quickDrop = "true";
                }
              }} onPointerUp={(event) => {
                if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
                const target = targetAt(event.clientX, event.clientY)?.dataset.quickToolId;
                clearMarker();
                if (target) reorder(bookmark.id, target);
              }} onLostPointerCapture={clearMarker}><Grip className="size-4" /></span>
              <Button type="button" size="icon-sm" variant="ghost" disabled={pending || index === visible.length - 1} aria-label={`后移 ${label}`} onClick={() => reorder(bookmark.id, visible[index + 1].id)}><ArrowDown aria-hidden /></Button>
            </div>}
          </div>;
        })}
      </div> : <QuickTools items={items} showIcons={showIcons} />}
      {!items.length && <p className="rounded-lg border border-dashed px-4 py-5 text-sm text-muted-foreground">没有常用入口。可从已保存的书签中添加。</p>}
      {editor && <BookmarkDialog key={editor.key} autoOpen bookmark={editor.data} categories={categoryOptions} trigger={<button type="button" hidden>书签</button>} onSaved={(id) => {
        if (editor.data) { router.refresh(); return; }
        if (!id) { setStatus({ text: "书签已保存，但未添加到常用入口。", error: true }); return; }
        run(async () => {
          const result = await changeQuickTool({ kind: "add", id });
          return result?.ok ? result : { error: `书签已保存，但没有加入入口：${result?.error ?? "请重试。"}` };
        }, "书签已创建并添加到常用入口。", "书签已保存，但无法确认是否加入入口，请刷新后检查。");
      }} />}
      <Dialog open={!!deleting} onOpenChange={(open) => { if (!open && !pending) setDeleting(undefined); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>删除书签？</DialogTitle><DialogDescription>「{deleting && displayTitle(deleting.title, deleting.url)}」会从书签库和常用入口删除，此操作不可撤销。若只想取消快捷方式，请选择「仅移除入口」。</DialogDescription></DialogHeader>
          {status?.error && <p role="alert" className="text-sm text-destructive">{status.text}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={() => setDeleting(undefined)}>取消</Button>
            <Button type="button" variant="destructive" disabled={pending} onClick={() => {
              if (!deleting) return;
              const id = deleting.id;
              run(async () => {
                const result = await deleteBookmarks([id]);
                if (!result.ok) return result;
                setDeleting(undefined);
                try { if (!(await changeQuickTool({ kind: "remove", id }))?.ok) return { error: "书签已删除，但未能清理入口配置。" }; }
                catch { return { error: "书签已删除，但未能清理入口配置。" }; }
                return result;
              }, "书签已删除。", "无法确认删除结果，请刷新后检查。");
            }}>{pending ? "删除中…" : "确认删除"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {status && !(deleting && status.error) && <p role={status.error ? "alert" : "status"} className={`mt-2 text-xs ${status.error ? "text-destructive" : "text-muted-foreground"}`}>{status.text}</p>}
    </section>
  );
}


/**
 * 前台「新增书签」。
 *
 * 直接复用后台那张表单：字段完全一样，没必要在前台再写一份。
 * 这样在当前页就能加书签，不用跳去后台 —— 公开页面本身不暴露写接口，
 * 写操作走的是 Server Action，鉴权仍在 requireAdmin() 里。
 */
export function AddBookmarkButton({
  categories,
  defaultCategoryId,
  label = "新增书签",
  variant = "primary",
  size = "compact",
}: {
  categories: CategoryOption[];
  defaultCategoryId?: string | null;
  label?: string;
  variant?: "primary" | "ghost";
  size?: "compact" | "prominent" | "home";
}) {
  return (
    <BookmarkDialog
      categories={categories}
      defaultCategoryId={defaultCategoryId}
      trigger={
        variant === "primary" ? (
          <button
            type="button"
            aria-label={label}
            className={`flex items-center gap-2 rounded-lg bg-primary text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${size === "prominent" ? "h-11 px-4" : size === "home" ? "h-8 px-3" : "h-9 px-3"}`}
          >
            <Plus className="size-4" aria-hidden />
            <span className={size === "compact" ? "hidden sm:inline" : undefined}>{label}</span>
          </button>
        ) : (
          <button
            type="button"
            className="flex items-center gap-1 text-[11.5px] text-muted-foreground transition-colors hover:text-primary"
          >
            <Plus className="size-3" />
            {label}
          </button>
        )
      }
    />
  );
}

/**
 * 前台「常用工具」编辑。
 *
 * 原来这里的「管理工具」要跳去后台设置页，改三个工具得走三层。
 * 现在就地弹窗：勾选 → 排序 → 保存。
 *
 * 只写 quick_tool_ids 一个 key（saveQuickTools），
 * 不复用 saveSettings —— 那个会读站点名称等字段，前台弹窗没有这些输入，
 * 传空进去会把站点名清掉。
 */
export function QuickToolsDialog({
  initialIds,
  candidates,
  autoOpen = false,
  disabled = false,
}: {
  initialIds: string[];
  candidates: PublicBookmark[];
  disabled?: boolean;
  autoOpen?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(autoOpen);
  const [ids, setIds] = React.useState<string[]>(initialIds);
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  // 每次打开都跟服务端对齐，避免上次没保存的改动残留
  function changeOpen(next: boolean) {
    if (pending || disabled) return;
    if (next) {
      setIds(initialIds);
      setError(null);
    }
    setOpen(next);
  }

  const byId = React.useMemo(
    () => new Map(candidates.map((c) => [c.id, c])),
    [candidates],
  );

  const chosen = ids.map(
    (id) => byId.get(id) ?? { id, title: "（暂不可用）", url: "" },
  );
  const remaining = candidates.filter((c) => !ids.includes(c.id));

  const add = (id: string) =>
    setIds((prev) => (prev.includes(id) || prev.length >= MAX_QUICK_TOOLS ? prev : [...prev, id]));
  const remove = (id: string) => setIds((prev) => prev.filter((x) => x !== id));
  const move = (id: string, dir: -1 | 1) =>
    setIds((prev) => {
      const i = prev.indexOf(id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const save = () => {
    start(async () => {
      try {
        const res = await saveQuickTools(ids);
        if (!res?.ok) { setError(res?.error ?? "保存失败，请重试。"); return; }
        setOpen(false);
        router.refresh();
      } catch { setError("保存失败，请刷新后重试。"); }
    });
  };

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={disabled}>
          <Plus aria-hidden /> 添加常用入口
        </Button>
      </DialogTrigger>

      {/* 同 BookmarkForm：矮视口下 header/按钮常驻，中间列表自己滚 */}
      <DialogContent className="grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-md">
        <DialogHeader>
          <DialogTitle>常用工具</DialogTitle>
          <DialogDescription>
            首页顶部那一排快捷入口。不选则自动显示点击最多的 8 个，最多 12 个。暂不可用的已选项会保留。
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 space-y-3 overflow-y-auto overscroll-contain pr-1">
          <div>
            <Label className="text-[12px]">已选 {ids.length} / 12</Label>
            {chosen.length > 0 ? (
              <ul className="mt-1.5 space-y-1">
                {chosen.map((c, i) => (
                  <li
                    key={c.id}
                    className="flex items-center gap-1.5 rounded-md border bg-muted/30 px-2 py-1.5"
                  >
                    <span className="flex shrink-0 flex-col">
                      <button
                        type="button"
                        onClick={() => move(c.id, -1)}
                        disabled={pending || i === 0}
                        aria-label={`把 ${c.title} 上移`}
                        className="text-muted-foreground/60 hover:text-foreground disabled:opacity-25"
                      >
                        <ArrowUp className="size-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => move(c.id, 1)}
                        disabled={pending || i === chosen.length - 1}
                        aria-label={`把 ${c.title} 下移`}
                        className="text-muted-foreground/60 hover:text-foreground disabled:opacity-25"
                      >
                        <ArrowDown className="size-3" />
                      </button>
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px]">
                      {c.url ? displayTitle(c.title, c.url) : c.title}
                    </span>
                    <button
                      type="button"
                      onClick={() => remove(c.id)}
                      disabled={pending || !c.url}
                      aria-label={`移除 ${c.title}`}
                      className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-destructive"
                    >
                      <X className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1.5 rounded-md border border-dashed px-3 py-2 text-[12px] text-muted-foreground">
                还没选，首页按点击量自动取前 8 个。
              </p>
            )}
          </div>

          {remaining.length > 0 ? (
            <div>
              <Label className="text-[12px]">可添加（{remaining.length}）</Label>
              <ul className="mt-1.5 max-h-52 space-y-0.5 overflow-y-auto rounded-md border p-1.5">
                {remaining.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => add(c.id)}
                      disabled={pending || ids.length >= MAX_QUICK_TOOLS}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-start text-[13px] transition-colors hover:bg-secondary disabled:opacity-40"
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {displayTitle(c.title, c.url)}
                      </span>
                      <span className="max-w-[7rem] shrink-0 truncate font-mono text-[10.5px] text-muted-foreground">
                        {hostOf(c.url)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {error ? (
            <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-[12.5px] text-destructive">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter className="border-t border-border pt-3">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            取消
          </Button>
          <Button type="button" onClick={save} disabled={pending}>
            {pending ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                保存中…
              </>
            ) : (
              "保存"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
