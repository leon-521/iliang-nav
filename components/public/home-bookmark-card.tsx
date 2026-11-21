"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Ellipsis, Grip, Pencil, Trash2 } from "lucide-react";
import { ContextMenu } from "radix-ui";
import { BookmarkDialog, type CategoryOption, type EditableBookmark } from "@/components/admin/BookmarkForm";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { deleteBookmarks } from "@/lib/bookmarks/actions";
import { homeBookmarkEditor, moveHomeBookmark } from "@/lib/home-actions";

export function HomeBookmarkCard({ id, label, categories, previous, next, className, footerClass, metadata, children }: {
  id: string; label: string; categories: CategoryOption[]; previous?: string; next?: string;
  className: string; footerClass: string; metadata: React.ReactNode; children: React.ReactNode;
}) {
  const router = useRouter();
  const [pending, run] = useTransition();
  const [failure, setFailure] = useState("");
  const marker = useRef<HTMLElement | null>(null);
  const [editing, setEditing] = useState<{ data: EditableBookmark; key: number }>();
  const [removing, setRemoving] = useState(false);

  function perform(task: () => Promise<{ ok: boolean; error?: string }>, onDone = () => {}) {
    if (pending) return;
    setFailure("");
    run(async () => {
      try {
        const result = await task();
        if (result.ok) { onDone(); router.refresh(); }
        else setFailure(result.error || "未保存，请重试。");
      } catch { setFailure("操作未完成，请刷新后重试。"); }
    });
  }

  function move(source: string, target: string, after: boolean) {
    if (source !== target) perform(() => moveHomeBookmark({ source, target, after }));
  }

  function edit() {
    setFailure("");
    run(async () => {
      try {
        const data = await homeBookmarkEditor(id);
        if (!data) { setFailure("书签不存在。"); return; }
        setEditing((old) => ({ data, key: (old?.key ?? 0) + 1 }));
      } catch { setFailure("无法打开编辑，请刷新后重试。"); }
    });
  }

  function clearMarker() {
    if (marker.current) delete marker.current.dataset.drop;
    marker.current = null;
  }

  const commands = [
    { label: "编辑书签", icon: Pencil, action: edit, disabled: pending },
    { label: "向前移动", icon: ArrowUp, action: () => previous && move(id, previous, false), disabled: pending || !previous },
    { label: "向后移动", icon: ArrowDown, action: () => next && move(id, next, true), disabled: pending || !next },
    { label: "删除书签", icon: Trash2, action: () => { setFailure(""); setRemoving(true); }, disabled: pending },
  ];

  return (
    <>
      <ContextMenu.Root>
        <ContextMenu.Trigger asChild>
          <li data-home-bookmark={id} className={`${className} relative data-[drop=true]:ring-2 data-[drop=true]:ring-primary`} aria-busy={pending}>
            {children}
            <div className={footerClass}>
              {metadata}
              <div className="flex shrink-0 items-center gap-0.5">
              {(previous || next) && <span title="拖到其他书签卡片上半区或下半区排序" aria-hidden className="touch-none cursor-grab select-none rounded p-1 text-muted-foreground active:cursor-grabbing" onPointerDown={(event) => {
                if (event.button !== 0 || pending) return;
                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
              }} onPointerMove={(event) => {
                if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
                const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-home-bookmark]");
                if (marker.current === target) return;
                clearMarker();
                if (target && target.dataset.homeBookmark !== id) {
                  marker.current = target;
                  target.dataset.drop = "true";
                }
              }} onPointerUp={(event) => {
                if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
                const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-home-bookmark]");
                clearMarker();
                if (target?.dataset.homeBookmark) {
                  const rect = target.getBoundingClientRect();
                  move(id, target.dataset.homeBookmark, event.clientY > rect.top + rect.height / 2);
                }
              }} onLostPointerCapture={clearMarker}><Grip className="size-4" /></span>}
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon-xs" aria-label={`${label}的书签操作`}><Ellipsis /></Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {commands.map(({ label, icon: Icon, action, disabled }) => <DropdownMenuItem key={label} disabled={disabled} onSelect={action}><Icon aria-hidden />{label}</DropdownMenuItem>)}
                </DropdownMenuContent>
              </DropdownMenu>
              </div>
            </div>
            {failure && !removing && <p role="alert" className="w-full text-xs text-destructive">{failure}</p>}
          </li>
        </ContextMenu.Trigger>
        <ContextMenu.Portal><ContextMenu.Content className="z-50 min-w-40 rounded-lg border bg-popover p-1 text-popover-foreground shadow-md">
          {commands.map(({ label, icon: Icon, action, disabled }) => <ContextMenu.Item key={label} disabled={disabled} onSelect={action} className="flex cursor-default items-center gap-2 rounded-md px-2 py-2 text-sm outline-none data-[disabled]:opacity-45 data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"><Icon className="size-4" aria-hidden />{label}</ContextMenu.Item>)}
        </ContextMenu.Content></ContextMenu.Portal>
      </ContextMenu.Root>
      {editing && <BookmarkDialog key={editing.key} autoOpen bookmark={editing.data} categories={categories} trigger={<button type="button" hidden>编辑</button>} />}
      <Dialog open={removing} onOpenChange={(value) => { if (!pending) setRemoving(value); }}>
        <DialogContent><DialogHeader><DialogTitle>删除书签？</DialogTitle><DialogDescription>「{label}」将从书签库删除，此操作不可撤销。</DialogDescription></DialogHeader>
          {failure && <p role="alert" className="text-sm text-destructive">{failure}</p>}
          <DialogFooter><Button variant="outline" disabled={pending} onClick={() => setRemoving(false)}>取消</Button><Button variant="destructive" disabled={pending} onClick={() => perform(() => deleteBookmarks([id]), () => setRemoving(false))}>确认删除</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
