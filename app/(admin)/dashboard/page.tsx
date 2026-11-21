import { Suspense } from "react";
import { ProjectInfoCard } from "@/components/admin/project-info-card";
import { safeHref } from "@/lib/public/safe-href";
import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import {
  ArrowUpRight,
  Bookmark as BookmarkIcon,
  FolderTree,
  Link2Off,
  Globe,
} from "lucide-react";
import { db } from "@/lib/db";
import { bookmarks, categories } from "@/lib/db/schema";
import { Main, PageHeader } from "@/components/layout/main";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [totals] = db
    .select({
      total: sql<number>`count(*)`,
      publicCount: sql<number>`sum(case when ${bookmarks.effectiveVisibility} = 'public' then 1 else 0 end)`,
      broken: sql<number>`sum(case when ${bookmarks.isBroken} = 1 then 1 else 0 end)`,
    })
    .from(bookmarks)
    .all();

  const [catTotal] = db
    .select({ n: sql<number>`count(*)` })
    .from(categories)
    .all();

  const recent = db
    .select({
      id: bookmarks.id,
      title: bookmarks.title,
      url: bookmarks.url,
      visibility: bookmarks.effectiveVisibility,
      createdAt: bookmarks.createdAt,
      categoryName: categories.name,
    })
    .from(bookmarks)
    .leftJoin(categories, eq(bookmarks.categoryId, categories.id))
    .orderBy(desc(bookmarks.createdAt))
    .limit(6)
    .all();

  const perCategory = db
    .select({
      name: categories.name,
      n: sql<number>`count(${bookmarks.id})`,
    })
    .from(categories)
    .leftJoin(bookmarks, eq(bookmarks.categoryId, categories.id))
    .groupBy(categories.id)
    .orderBy(sql`count(${bookmarks.id}) desc`)
    .limit(5)
    .all();

  const stats = [
    {
      label: "书签总数",
      value: Number(totals?.total ?? 0),
      icon: BookmarkIcon,
      hint: "全部条目",
    },
    {
      label: "公开可见",
      value: Number(totals?.publicCount ?? 0),
      icon: Globe,
      hint: "出现在公开主页",
    },
    {
      label: "分类",
      value: Number(catTotal?.n ?? 0),
      icon: FolderTree,
      hint: "含子分类",
    },
    {
      label: "死链",
      value: Number(totals?.broken ?? 0),
      icon: Link2Off,
      hint: "最近一次检测",
    },
  ];

  const max = Math.max(1, ...perCategory.map((c) => Number(c.n)));

  return (
    <Main>
      <PageHeader
        title="概览"
        description="书签库的当前状态。"
      >
        <Button asChild size="sm" variant="outline">
          <Link href="/import">导入书签</Link>
        </Button>
        <Button asChild size="sm">
          <Link href="/bookmarks">管理书签</Link>
        </Button>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="gap-0 py-0">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                  {s.label}
                </span>
                <s.icon className="size-4 text-muted-foreground/60" />
              </div>
              <div className="mt-2 text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">
                {s.value}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground/70">
                {s.hint}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-base">最近添加</CardTitle>
            <CardDescription>最新入库的 {recent.length} 条</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            {recent.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                还没有书签
              </p>
            ) : (
              <ul className="divide-y">
                {recent.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0 flex-1">
                      <a
                        href={safeHref(r.url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group inline-flex max-w-full items-center gap-1 text-sm font-medium hover:underline"
                      >
                        <span className="truncate">{r.title}</span>
                        <ArrowUpRight className="size-3 shrink-0 opacity-0 transition group-hover:opacity-50 pointer-coarse:opacity-40" />
                      </a>
                      <div className="truncate font-mono text-xs text-muted-foreground">
                        {r.url}
                      </div>
                    </div>
                    <span className="hidden max-w-[30%] shrink-0 truncate text-xs text-muted-foreground sm:block">
                      {r.categoryName ?? "未分类"}
                    </span>
                    <Badge
                      variant="outline"
                      className={
                        r.visibility === "public"
                          ? "border-transparent bg-emerald-500/12 text-emerald-700 dark:text-emerald-400"
                          : "border-transparent bg-muted text-muted-foreground"
                      }
                    >
                      {r.visibility === "public" ? "公开" : "私有"}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">分类分布</CardTitle>
            <CardDescription>书签最多的 5 个分类</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            {perCategory.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                还没有分类
              </p>
            ) : (
              perCategory.map((c) => (
                <div key={c.name}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="truncate font-medium">{c.name}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {Number(c.n)}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary/75"
                      style={{
                        width: `${Math.max(3, (Number(c.n) / max) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              ))
            )}
            <Separator className="my-1" />
            <Button asChild variant="ghost" size="sm" className="w-full">
              <Link href="/categories">管理分类</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
      <Suspense fallback={<ProjectInfoCard pending />}>
        <ProjectInfoCard />
      </Suspense>
    </Main>
  );
}
