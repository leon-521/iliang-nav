"use client";

import * as React from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  CornerDownRight,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import {
  createCategory,
  deleteCategory,
  moveCategory,
  renameCategory,
  reorderCategory,
  setCategoryVisibility,
} from "@/lib/categories/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type CatNode = {
  id: string;
  name: string;
  parentId: string | null;
  visibility: string;
  /** 直接挂在本分类下的书签数 */
  count: number;
  /** 含所有后代分类的书签数 */
  total: number;
  children: CatNode[];
};

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

function Node({
  node,
  allFlat,
  depth,
  isFirst,
  isLast,
}: {
  node: CatNode;
  allFlat: Array<{ id: string; name: string; depth: number }>;
  depth: number;
  /** 同级里的位置：决定上移 / 下移按钮是否可用 */
  isFirst: boolean;
  isLast: boolean;
}) {
  const [pending, start] = React.useTransition();
  const [editing, setEditing] = React.useState(false);
  const [name, setName] = React.useState(node.name);

  const descendants = React.useMemo(() => {
    const set = new Set<string>();
    const walk = (n: CatNode) => {
      for (const c of n.children) {
        set.add(c.id);
        walk(c);
      }
    };
    walk(node);
    return set;
  }, [node]);

  return (
    <li>
      <div
        className="group flex min-h-11 items-center gap-2 rounded-md py-1.5 pe-1.5 transition-colors hover:bg-accent/60 sm:min-h-0"
        style={{ paddingInlineStart: depth * 18 + 8 }}
      >
        {editing ? (
          <>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              className="h-7 flex-1 text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  start(async () => {
                    await renameCategory(node.id, name);
                    setEditing(false);
                  });
                }
                if (e.key === "Escape") {
                  setName(node.name);
                  setEditing(false);
                }
              }}
            />
            <Button
              size="icon"
              variant="ghost"
              className="size-7 text-emerald-600"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  await renameCategory(node.id, name);
                  setEditing(false);
                })
              }
            >
              <Check className="size-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="size-7 text-muted-foreground"
              onClick={() => {
                setName(node.name);
                setEditing(false);
              }}
            >
              <X className="size-3.5" />
            </Button>
          </>
        ) : (
          <>
            {depth > 0 ? (
              <CornerDownRight className="size-3 shrink-0 text-muted-foreground/40" />
            ) : null}

            <span className="flex-1 truncate text-sm font-medium">
              {node.name}
            </span>

            <span className="text-xs tabular-nums text-muted-foreground">
              {node.count}
              {node.total !== node.count ? (
                <span className="text-muted-foreground/50"> / {node.total}</span>
              ) : null}
            </span>

            <Badge
              variant="outline"
              className={cn("font-normal", VIS[node.visibility]?.className)}
            >
              {VIS[node.visibility]?.label ?? node.visibility}
            </Badge>

            {/*
              上移 / 下移。
              只在自己所在的同级里换位置，不跨父级 —— 想把分类挪到
              别的父分类下面，走「更多操作 → 移动到」，那是另一件事。
            */}
            <div className="flex shrink-0 items-center">
              <Button
                size="icon"
                variant="ghost"
                className="size-8 opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100 disabled:opacity-0 pointer-coarse:opacity-100 sm:size-6"
                disabled={pending || isFirst}
                onClick={() =>
                  start(async () => {
                    await reorderCategory(node.id, "up");
                  })
                }
                aria-label={`上移 ${node.name}`}
                title="上移"
              >
                <ChevronUp className="size-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-8 opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100 disabled:opacity-0 pointer-coarse:opacity-100 sm:size-6"
                disabled={pending || isLast}
                onClick={() =>
                  start(async () => {
                    await reorderCategory(node.id, "down");
                  })
                }
                aria-label={`下移 ${node.name}`}
                title="下移"
              >
                <ChevronDown className="size-3.5" />
              </Button>
            </div>

            {/* 触屏没有 hover：pointer-coarse 下常显，否则这个按钮等于不存在 */}
            <Button
              size="icon"
              variant="ghost"
              className="size-8 shrink-0 opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100 sm:size-7"
              onClick={() => setEditing(true)}
              aria-label="改名"
            >
              <Pencil className="size-3.5" />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8 shrink-0 sm:size-7"
                  disabled={pending}
                  aria-label="更多操作"
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  可见性
                </DropdownMenuLabel>
                {Object.entries(VIS).map(([v, cfg]) => (
                  <DropdownMenuItem
                    key={v}
                    onClick={() =>
                      start(async () => {
                        await setCategoryVisibility(
                          node.id,
                          v as "public" | "private" | "unlisted",
                        );
                      })
                    }
                  >
                    {node.visibility === v ? (
                      <Check className="size-4" />
                    ) : (
                      <span className="size-4" />
                    )}
                    {cfg.label}
                  </DropdownMenuItem>
                ))}

                <DropdownMenuSeparator />

                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>移动到</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="max-h-64 w-56 overflow-y-auto">
                    <DropdownMenuItem
                      onClick={() =>
                        start(async () => {
                          await moveCategory(node.id, null);
                        })
                      }
                    >
                      顶层
                    </DropdownMenuItem>
                    {allFlat
                      .filter((c) => c.id !== node.id && !descendants.has(c.id))
                      .map((c) => (
                        <DropdownMenuItem
                          key={c.id}
                          onClick={() =>
                            start(async () => {
                              await moveCategory(node.id, c.id);
                            })
                          }
                        >
                          {"　".repeat(c.depth)}
                          {c.name}
                        </DropdownMenuItem>
                      ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>

                <DropdownMenuSeparator />

                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => {
                    if (!confirm(`删除分类「${node.name}」？书签会移到父级。`))
                      return;
                    start(async () => {
                      await deleteCategory(node.id, "move");
                    });
                  }}
                >
                  <Trash2 className="size-4" />
                  删除
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </div>

      {node.children.length > 0 ? (
        <ul>
          {node.children.map((c, i) => (
            <Node
              key={c.id}
              node={c}
              allFlat={allFlat}
              depth={depth + 1}
              isFirst={i === 0}
              isLast={i === node.children.length - 1}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function CategoryTree({
  tree,
  flat,
}: {
  tree: CatNode[];
  flat: Array<{ id: string; name: string; depth: number }>;
}) {
  const [pending, start] = React.useTransition();
  const [name, setName] = React.useState("");
  const [parentId, setParentId] = React.useState("__root__");

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          const fd = new FormData();
          fd.set("name", name);
          if (parentId && parentId !== "__root__") fd.set("parentId", parentId);
          start(async () => {
            await createCategory(fd);
            setName("");
            setParentId("__root__");
          });
        }}
        className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3"
      >
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="新分类名称"
          className="h-9 w-full sm:h-8 sm:w-48"
        />

        <Select value={parentId} onValueChange={setParentId}>
          <SelectTrigger size="sm" className="w-full sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__root__">作为顶层分类</SelectItem>
            {flat.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {"　".repeat(c.depth)}
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          type="submit"
          size="sm"
          className="w-full sm:w-auto"
          disabled={pending || !name.trim()}
        >
          <FolderPlus className="size-4" />
          新建
        </Button>
      </form>

      <div className="rounded-xl border bg-card p-2">
        {tree.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm text-muted-foreground">还没有分类</p>
            <p className="mt-1 text-xs text-muted-foreground/70">
              先建一个顶层分类，再往里放书签
            </p>
          </div>
        ) : (
          <ul className="space-y-0.5">
            {tree.map((n, i) => (
              <Node
                key={n.id}
                node={n}
                allFlat={flat}
                depth={0}
                isFirst={i === 0}
                isLast={i === tree.length - 1}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
