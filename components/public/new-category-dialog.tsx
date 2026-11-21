"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createCategory } from "@/lib/categories/actions";
import type { CategoryOption } from "@/lib/public/service";

export function NewCategoryDialog({ categories, className }: { categories: CategoryOption[]; className?: string }) {
  const uid = useId();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, run] = useTransition();
  const [error, setError] = useState("");
  const select = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring";
  return (
    <Dialog open={open} onOpenChange={(value) => { if (!pending) { setOpen(value); setError(""); } }}>
      <DialogTrigger asChild><Button type="button" variant="outline" size="sm" className={className}><Plus aria-hidden />新建分类</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>新建分类</DialogTitle><DialogDescription>创建顶级分类或子分类，不用离开当前页面。</DialogDescription></DialogHeader>
        <form className="space-y-4" onSubmit={(event) => {
          event.preventDefault();
          if (pending) return;
          const data = new FormData(event.currentTarget);
          const name = String(data.get("name") ?? "").trim();
          if (!name) { setError("请输入分类名称。"); return; }
          data.set("name", name);
          setError("");
          run(async () => {
            try {
              const result = await createCategory(data);
              if (result.ok) { setOpen(false); router.refresh(); }
              else setError(result.error ?? "无法创建分类。");
            } catch { setError("无法创建分类，请刷新后重试。"); }
          });
        }}>
          <div className="space-y-2"><Label htmlFor={`${uid}-name`}>分类名称</Label><Input id={`${uid}-name`} name="name" required maxLength={60} disabled={pending} /></div>
          <div className="space-y-2"><Label htmlFor={`${uid}-parent`}>上级分类</Label><select id={`${uid}-parent`} name="parentId" className={select} disabled={pending}>
            <option value="">无（顶级分类）</option>{categories.map(({ id, name, depth }) => <option key={id} value={id}>{"　".repeat(depth)}{name}</option>)}
          </select></div>
          <div className="space-y-2"><Label htmlFor={`${uid}-visibility`}>可见性</Label><select id={`${uid}-visibility`} name="visibility" defaultValue="private" className={select} disabled={pending}>
            <option value="private">私有</option><option value="unlisted">链接可见</option><option value="public">公开</option>
          </select></div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter><Button type="button" variant="outline" disabled={pending} onClick={() => { setError(""); setOpen(false); }}>取消</Button><Button type="submit" disabled={pending}>{pending ? "创建中…" : "创建分类"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
