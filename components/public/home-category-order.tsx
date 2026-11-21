"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, GripVertical, ListOrdered } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { moveHomeCategory, saveCategoryWeight } from "@/lib/home-actions";
import type { PublicCategory } from "@/lib/public/service";

const categoryDrag = "application/x-iliang-category";

export function HomeCategoryOrder({ categories }: { categories: PublicCategory[] }) {
  const router = useRouter();
  const [currentParent, setCurrentParent] = useState("");
  const [pending, run] = useTransition();
  const [message, setMessage] = useState("");
  const current = categories.some((item) => item.id === currentParent) ? currentParent : "";
  const siblings = categories.filter((item) => (item.parentId ?? "") === current);
  const byParent = new Map<string, PublicCategory[]>();
  for (const item of categories) {
    const parent = item.parentId ?? "";
    const list = byParent.get(parent) ?? [];
    list.push(item);
    byParent.set(parent, list);
  }
  const seen = new Set<string>();
  const options: { item: PublicCategory; depth: number }[] = [];
  function walk(parent: string, depth: number) {
    for (const item of byParent.get(parent) ?? []) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      if (byParent.has(item.id)) options.push({ item, depth });
      walk(item.id, depth + 1);
    }
  }
  walk("", 0);

  function submit(action: () => Promise<{ ok: boolean; error?: string }>) {
    if (pending) return;
    setMessage("");
    run(async () => {
      try {
        const result = await action();
        if (result.ok) { setMessage("顺序已保存。"); router.refresh(); }
        else setMessage(result.error || "未保存，请重试。");
      } catch { setMessage("未保存，请刷新后重试。"); }
    });
  }
  function move(source: string, target: string, after: boolean) {
    if (source !== target) submit(() => moveHomeCategory({ source, target, after }));
  }

  return <Dialog>
    <DialogTrigger asChild><Button variant="outline" size="sm"><ListOrdered aria-hidden /> 分类排序</Button></DialogTrigger>
    <DialogContent className="max-h-[90dvh] overflow-auto sm:max-w-xl">
      <DialogHeader><DialogTitle>首页分类排序</DialogTitle><DialogDescription>选择某一级父分类后，拖拽或用上下箭头调整同级顺序。权重越小越靠前，修改后点击「保存」。</DialogDescription></DialogHeader>
      <label className="grid gap-1 text-sm">所在层级<select className="h-9 rounded-lg border bg-background px-2" value={current} onChange={(event) => { setCurrentParent(event.target.value); setMessage(""); }} disabled={pending}>
        <option value="">顶级分类</option>
        {options.map(({ item, depth }) => <option key={item.id} value={item.id}>{"　".repeat(depth)}{item.name}的子分类</option>)}
      </select></label>
      <ul className="space-y-2" aria-busy={pending}>
        {siblings.map((item, index) => <li key={item.id} data-home-category={item.id} className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2"
          onDragOver={(event) => { if (!pending && event.dataTransfer.types.includes(categoryDrag)) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; } }}
          onDrop={(event) => { event.preventDefault(); const source = event.dataTransfer.getData(categoryDrag); const rect = event.currentTarget.getBoundingClientRect(); if (source) move(source, item.id, event.clientY > rect.top + rect.height / 2); }}>
          <span draggable={!pending} onDragStart={(event) => { event.dataTransfer.setData(categoryDrag, item.id); event.dataTransfer.effectAllowed = "move"; }} onPointerDown={(event) => { if (event.pointerType === "touch" && !pending) event.currentTarget.setPointerCapture(event.pointerId); }}
            onPointerUp={(event) => {
              if (event.pointerType !== "touch" || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
              const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-home-category]");
              if (target?.dataset.homeCategory) {
                const rect = target.getBoundingClientRect();
                move(item.id, target.dataset.homeCategory, event.clientY > rect.top + rect.height / 2);
              }
            }} className="touch-none cursor-grab rounded p-2 text-muted-foreground" title="拖拽调整同级分类顺序" aria-hidden><GripVertical className="size-4" /></span>
          <span className="min-w-0 flex-1 break-words text-sm">{item.name}</span>
          <Button type="button" variant="ghost" size="icon-xs" aria-label={`上移${item.name}`} disabled={!index || pending} onClick={() => move(item.id, siblings[index - 1].id, false)}><ArrowUp /></Button>
          <Button type="button" variant="ghost" size="icon-xs" aria-label={`下移${item.name}`} disabled={index === siblings.length - 1 || pending} onClick={() => move(item.id, siblings[index + 1].id, true)}><ArrowDown /></Button>
          <form className="flex items-center gap-1" onSubmit={(event) => {
            event.preventDefault();
            const value = new FormData(event.currentTarget).get("weight");
            if (typeof value === "string" && value.trim()) submit(() => saveCategoryWeight(item.id, Number(value)));
          }}>
            <input key={item.sortOrder} type="number" name="weight" required min={-9999} max={9999} defaultValue={item.sortOrder} aria-label={`${item.name}权重`} className="h-8 w-[76px] rounded-md border bg-background px-1.5 text-sm" disabled={pending} />
            <Button type="submit" variant="outline" size="sm" disabled={pending}>保存</Button>
          </form>
        </li>)}
      </ul>
      {!siblings.length && <p className="text-sm text-muted-foreground">这一级还没有分类。</p>}
      {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
    </DialogContent>
  </Dialog>;
}
