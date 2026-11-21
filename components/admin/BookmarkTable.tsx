"use client";

import * as React from "react";
import { ArrowUpDown, ExternalLink, Loader2, Search, Trash2 } from "lucide-react";
import {
  bulkMove,
  bulkVisibility,
  deleteBookmarks,
  setVisibility,
} from "@/lib/bookmarks/actions";
import { EditBookmarkButton } from "@/components/admin/BookmarkForm";
import { MetadataRefreshButton } from "@/components/admin/MetadataRefreshButton";
import type { Category } from "@/lib/db/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

import { tagKey } from "@/lib/bookmarks/tags";

export type Row = {
  tags: string[];
  id: string;
  title: string;
  url: string;
  /** 备用链接：主站打不开时的第二入口 */
  altUrl: string | null;
  description: string | null;
  iconUrl: string | null;
  visibility: string;
  /** 书签自身的可见性，null 表示继承分类 */
  ownVisibility: string | null;
  isBroken: boolean;
  categoryId: string | null;
  categoryName: string | null;
  /** 首页展示顺序，数字小的排前面 */
  sortOrder: number;
};

type Cat = Category & { depth: number };

const VIS: Record<string, { label: string; className: string }> = {
  public: {
    label: "公开",
    className:
      "border-transparent bg-emerald-500/12 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  },
  unlisted: {
    label: "链接可见",
    className:
      "border-transparent bg-amber-500/12 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  },
  private: {
    label: "私有",
    className: "border-transparent bg-muted text-muted-foreground",
  },
};

type SortKey = "title" | "category" | "visibility" | "sortOrder";

export function BookmarkTable({
  rows,
  categories,
}: {
  rows: Row[];
  categories: Cat[];
}) {
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [q, setQ] = React.useState("");
  const [visFilter, setVisFilter] = React.useState("all");
  /**
   * 分类筛选。
   * "all" = 不筛；"__none__" = 未分类；其余是分类 id。
   * 选父分类时把子孙分类的书签也带出来 —— 只按 id 精确匹配的话，
   * 点「技术」会显示 0 条，而它的书签全在子分类里。
   */
  const [catFilter, setCatFilter] = React.useState("all");
  const [sort, setSort] = React.useState<{ key: SortKey; dir: 1 | -1 }>({
    /*
     * 默认按「排序」升序 —— 和首页的排列一致。
     * 默认按标题排的话，用户改完排序值回头看列表没动，
     * 会以为没保存上。
     */
    key: "sortOrder",
    dir: 1,
  });
  const [pending, start] = React.useTransition();
  const [deleting, setDeleting] = React.useState<string | null>(null);

  /** 每个分类 id 展开成「自己 + 所有后代」，供筛选用 */
  const catScope = React.useMemo(() => {
    const childrenOf = new Map<string | null, string[]>();
    for (const c of categories) {
      const k = c.parentId ?? null;
      if (!childrenOf.has(k)) childrenOf.set(k, []);
      childrenOf.get(k)!.push(c.id);
    }
    const out = new Map<string, Set<string>>();
    for (const c of categories) {
      const set = new Set<string>();
      const walk = (id: string) => {
        if (set.has(id)) return; // 防御脏数据里的环
        set.add(id);
        for (const child of childrenOf.get(id) ?? []) walk(child);
      };
      walk(c.id);
      out.set(c.id, set);
    }
    return out;
  }, [categories]);

  const filtered = React.useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = rows.filter((r) => {
      const matchText =
        !s ||
        r.title.toLowerCase().includes(s) ||
        r.url.toLowerCase().includes(s) ||
        (r.categoryName ?? "").toLowerCase().includes(s) ||
        r.tags.some((tag) => tagKey(tag).includes(tagKey(s)));
      const matchVis = visFilter === "all" || r.visibility === visFilter;
      const matchCat =
        catFilter === "all"
          ? true
          : catFilter === "__none__"
            ? !r.categoryId
            : Boolean(r.categoryId && catScope.get(catFilter)?.has(r.categoryId));
      return matchText && matchVis && matchCat;
    });

    return [...list].sort((a, b) => {
      /*
       * 排序值按数字比，别走 localeCompare —— 否则 10 会排在 9 前面。
       */
      if (sort.key === "sortOrder") {
        return (a.sortOrder - b.sortOrder) * sort.dir;
      }
      const va =
        sort.key === "title"
          ? a.title
          : sort.key === "category"
            ? (a.categoryName ?? "\uffff")
            : a.visibility;
      const vb =
        sort.key === "title"
          ? b.title
          : sort.key === "category"
            ? (b.categoryName ?? "\uffff")
            : b.visibility;
      return va.localeCompare(vb, "zh-CN") * sort.dir;
    });
  }, [rows, q, visFilter, catFilter, catScope, sort]);

  const allChecked =
    filtered.length > 0 && filtered.every((r) => selected.has(r.id));
  const someChecked = filtered.some((r) => selected.has(r.id));

  const toggleAll = () => {
    if (allChecked) setSelected(new Set());
    else setSelected(new Set(filtered.map((r) => r.id)));
  };

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const ids = [...selected];

  const run = (fn: () => Promise<unknown>) =>
    start(async () => {
      await fn();
      setSelected(new Set());
    });

  /**
   * 单行删除。
   * 不能写成 run(...).finally(...) —— startTransition 的回调返回 void，
   * 外面拿不到 Promise，`.finally` 会在编译期就报错。
   */
  const runDelete = (id: string) =>
    start(async () => {
      setDeleting(id);
      try {
        await deleteBookmarks([id]);
        setSelected((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      } finally {
        setDeleting(null);
      }
    });

  return (
    <div className="space-y-3">
      {/* 工具条 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-auto">
          <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="筛选标题、网址、分类…"
            className="h-9 w-full ps-8 text-sm sm:h-8 sm:w-56"
          />
        </div>

        <Select value={visFilter} onValueChange={setVisFilter}>
          <SelectTrigger size="sm" className="w-full sm:w-32">
            <SelectValue placeholder="可见性" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部可见性</SelectItem>
            <SelectItem value="public">公开</SelectItem>
            <SelectItem value="unlisted">链接可见</SelectItem>
            <SelectItem value="private">私有</SelectItem>
          </SelectContent>
        </Select>

        <Select value={catFilter} onValueChange={setCatFilter}>
          <SelectTrigger size="sm" className="w-full sm:w-40">
            <SelectValue placeholder="分类" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部分类</SelectItem>
            <SelectItem value="__none__">未分类</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {"　".repeat(c.depth)}
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="text-xs text-muted-foreground tabular-nums">
          {filtered.length} / {rows.length} 条
          {selected.size > 0 ? ` · 已选 ${selected.size}` : ""}
        </span>

        {/*
          补齐图标/简介。
          放在工具条而不是批量操作条：这个操作最常用的场景是
          「整个列表都是灰方块」，先点一次全量补，而不是先勾选。
          筛过之后按当前筛选结果补，正好对上「只处理这一批」的直觉。
        */}
        <MetadataRefreshButton
          ids={filtered.map((r) => r.id)}
          className="w-full sm:ms-auto sm:w-auto"
        />
      </div>

      {/* 批量操作条 */}
      {selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2">
          <span className="text-xs font-medium">已选 {selected.size} 条</span>
          <div className="ms-auto flex flex-wrap items-center gap-2">
            <Select
              value=""
              onValueChange={(v) =>
                run(() => bulkVisibility(ids, v as "public" | "private" | "unlisted"))
              }
              disabled={pending}
            >
              <SelectTrigger size="sm" className="w-36">
                <SelectValue placeholder="设为可见性…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="public">公开</SelectItem>
                <SelectItem value="unlisted">链接可见</SelectItem>
                <SelectItem value="private">私有</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value=""
              onValueChange={(v) =>
                run(() => bulkMove(ids, v === "__none__" ? null : v))
              }
              disabled={pending}
            >
              <SelectTrigger size="sm" className="w-36">
                <SelectValue placeholder="移动到分类…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">未分类</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {"　".repeat(c.depth)}
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant="destructive"
              size="sm"
              disabled={pending}
              onClick={() => {
                if (!confirm(`确定删除 ${ids.length} 条书签？`)) return;
                run(() => deleteBookmarks(ids));
              }}
              className="gap-1.5"
            >
              <Trash2 className="size-3.5" />
              删除
            </Button>
          </div>
        </div>
      ) : null}

      {/* 表格 */}
      <div className="overflow-hidden rounded-xl border">
        <Table className="sm:min-w-[38rem]">
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="w-10 ps-3">
                <Checkbox
                  checked={allChecked ? true : someChecked ? "indeterminate" : false}
                  onCheckedChange={toggleAll}
                  aria-label="全选"
                  className="size-[18px] sm:size-4"
                />
              </TableHead>
              <TableHead>
                <SortButton
                  active={sort.key === "title"}
                  dir={sort.dir}
                  onClick={() =>
                    setSort((s) => ({
                      key: "title",
                      dir: s.key === "title" ? ((s.dir * -1) as 1 | -1) : 1,
                    }))
                  }
                >
                  标题
                </SortButton>
              </TableHead>
              <TableHead className="hidden w-40 sm:table-cell">
                <SortButton
                  active={sort.key === "category"}
                  dir={sort.dir}
                  onClick={() =>
                    setSort((s) => ({
                      key: "category",
                      dir: s.key === "category" ? ((s.dir * -1) as 1 | -1) : 1,
                    }))
                  }
                >
                  分类
                </SortButton>
              </TableHead>
              <TableHead className="hidden w-20 sm:table-cell">
                <SortButton
                  active={sort.key === "sortOrder"}
                  dir={sort.dir}
                  onClick={() =>
                    setSort((s) => ({
                      key: "sortOrder",
                      dir: s.key === "sortOrder" ? ((s.dir * -1) as 1 | -1) : 1,
                    }))
                  }
                >
                  排序
                </SortButton>
              </TableHead>
              <TableHead className="hidden w-28 sm:table-cell">可见性</TableHead>
              <TableHead className="hidden w-24 pe-3 text-end sm:table-cell">
                操作
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((r) => (
              <TableRow
                key={r.id}
                data-state={selected.has(r.id) ? "selected" : undefined}
              >
                <TableCell className="ps-3">
                  <Checkbox
                    checked={selected.has(r.id)}
                    onCheckedChange={() => toggle(r.id)}
                    aria-label={`选择 ${r.title}`}
                    className="size-[18px] sm:size-4"
                  />
                </TableCell>
                <TableCell className="max-w-0">
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group inline-flex max-w-full items-center gap-1.5 font-medium hover:underline"
                  >
                    <span className="truncate">{r.title}</span>
                    <ExternalLink className="size-3 shrink-0 opacity-0 transition group-hover:opacity-60 pointer-coarse:opacity-50" />
                  </a>
                  <div className="truncate font-mono text-xs text-muted-foreground">
                    {r.url}
                  </div>

                  {r.tags.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1" aria-label="书签标签">
                      {r.tags.map((tag) => (
                        <Badge key={tag} variant="secondary" className="max-w-full font-normal">
                          <span className="truncate">{tag}</span>
                        </Badge>
                      ))}
                    </div>
                  )}

                  {/* 窄屏：可见性 + 操作并入标题单元格，避免横向滚动 */}
                  <div className="mt-1.5 flex items-center gap-2 sm:hidden">
                    <Badge
                      variant="outline"
                      className={cn("font-normal", VIS[r.visibility]?.className)}
                    >
                      {VIS[r.visibility]?.label ?? r.visibility}
                    </Badge>
                    {r.isBroken ? (
                      <Badge
                        variant="outline"
                        className="border-transparent bg-destructive/10 font-normal text-destructive"
                      >
                        死链
                      </Badge>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ms-auto h-8 px-2 text-xs"
                      disabled={pending}
                      onClick={() =>
                        run(() =>
                          setVisibility(
                            r.id,
                            r.visibility === "public" ? "private" : "public",
                          ),
                        )
                      }
                    >
                      {r.visibility === "public" ? "转私有" : "转公开"}
                    </Button>
                    <EditBookmarkButton
                      categories={categories}
                      bookmark={{
                        id: r.id,
                        url: r.url,
                        altUrl: r.altUrl,
                        title: r.title,
                        description: r.description,
                        iconUrl: r.iconUrl,
                        categoryId: r.categoryId,
                        visibility: r.ownVisibility,
                        sortOrder: r.sortOrder,
                        tags: r.tags,
                      }}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                      disabled={pending}
                      onClick={() => {
                        if (!confirm(`删除「${r.title}」？此操作不可撤销。`)) return;
                        runDelete(r.id);
                      }}
                    >
                      {deleting === r.id ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <Trash2 className="size-3" />
                      )}
                      删除
                    </Button>
                  </div>
                </TableCell>
                <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                  {r.categoryName ?? (
                    <span className="text-muted-foreground/60">未分类</span>
                  )}
                </TableCell>
                <TableCell className="hidden font-mono text-xs tabular-nums text-muted-foreground sm:table-cell">
                  {r.sortOrder}
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <div className="flex items-center gap-1.5">
                    <Badge
                      variant="outline"
                      className={cn("font-normal", VIS[r.visibility]?.className)}
                    >
                      {VIS[r.visibility]?.label ?? r.visibility}
                    </Badge>
                    {r.isBroken ? (
                      <Badge
                        variant="outline"
                        className="border-transparent bg-destructive/10 font-normal text-destructive"
                      >
                        死链
                      </Badge>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="hidden pe-3 text-end sm:table-cell">
                  <div className="flex items-center justify-end gap-0.5">
                    <EditBookmarkButton
                      categories={categories}
                      bookmark={{
                        id: r.id,
                        url: r.url,
                        altUrl: r.altUrl,
                        title: r.title,
                        description: r.description,
                        iconUrl: r.iconUrl,
                        categoryId: r.categoryId,
                        visibility: r.ownVisibility,
                        sortOrder: r.sortOrder,
                        tags: r.tags,
                      }}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive pointer-coarse:h-9"
                      disabled={pending}
                      aria-label={`删除 ${r.title}`}
                      onClick={() => {
                        if (!confirm(`删除「${r.title}」？此操作不可撤销。`)) return;
                        runDelete(r.id);
                      }}
                    >
                      {deleting === r.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="size-3.5" />
                      )}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}

            {filtered.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={6} className="h-32 text-center">
                  <p className="text-sm text-muted-foreground">
                    {rows.length === 0 ? "还没有书签" : "没有匹配的结果"}
                  </p>
                  {rows.length === 0 ? (
                    <p className="mt-1 text-xs text-muted-foreground/70">
                      点右上角「添加书签」，或到「导入」批量导入
                    </p>
                  ) : null}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function SortButton({
  children,
  active,
  dir,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  dir: 1 | -1;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground transition hover:text-foreground"
    >
      {children}
      <ArrowUpDown
        className={cn("size-3", active ? "opacity-100" : "opacity-30")}
        style={active && dir === -1 ? { transform: "scaleY(-1)" } : undefined}
      />
    </button>
  );
}
