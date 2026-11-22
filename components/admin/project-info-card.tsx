import "server-only";

import { ArrowUpRight, GitBranch } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchRepositoryVersion, type RepositoryVersion } from "@/lib/project-version-source";
import { version } from "@/package.json";
import { compareReleaseVersions, PROJECT_GITHUB_URL, PROJECT_REPOSITORY } from "@/lib/project-version";

const repository = PROJECT_REPOSITORY;
const repositoryUrl = PROJECT_GITHUB_URL;
let cached: { expires: number; result: Promise<RepositoryVersion> } | undefined;

function loadRelease(): Promise<RepositoryVersion> {
  if (cached && cached.expires > Date.now()) return cached.result;
  const result = fetchRepositoryVersion();
  const entry = { expires: Date.now() + 60_000, result };
  cached = entry;
  void result.then((release) => { if ("error" in release) entry.expires = Date.now() + 15_000; });
  return result;
}

const labels = { latest: "已是最新版本", update: "有新版本可用", ahead: "本地版本领先", unknown: "无法确认" };

export async function ProjectInfoCard({ pending = false }: { pending?: boolean }) {
  const release = pending ? null : await loadRelease();
  const tag = release && "tag" in release ? release.tag : null;
  const status = tag ? compareReleaseVersions(version, tag) : "unknown";

  return (
    <Card className="mt-4" aria-labelledby="project-info-title" aria-busy={pending}>
      <CardHeader>
        <CardTitle id="project-info-title" className="flex items-center gap-2 text-base"><GitBranch className="size-4 text-primary" aria-hidden /> 项目信息</CardTitle>
        <CardDescription>iliang nav 是一个可自托管的个人书签工作台，支持分类、标签、站内搜索、AI 整理和备份。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid grid-cols-1 gap-4 rounded-lg border bg-muted/30 p-4 sm:grid-cols-3">
          <div><dt className="text-xs text-muted-foreground">当前版本</dt><dd className="mt-1 font-mono text-sm font-semibold">v{version}</dd></div>
          <div><dt className="text-xs text-muted-foreground">仓库版本（VERSION.md）</dt><dd className="mt-1 break-all font-mono text-sm font-semibold">{pending ? "正在查询…" : tag ? `v${tag}` : "未知"}</dd></div>
          <div><dt className="text-xs text-muted-foreground">更新状态</dt><dd className="mt-1"><Badge variant={status === "update" ? "default" : "secondary"}>{pending ? "正在检查…" : labels[status]}</Badge></dd></div>
        </dl>
        {release && "error" in release && <p className="text-xs text-muted-foreground">{release.error}</p>}
        {release && "source" in release && <p className="text-xs text-muted-foreground">版本来源：{release.source}{release.source === "jsDelivr" && "（镜像可能有缓存延迟）"}</p>}
        {tag && status === "unknown" && <p className="text-xs text-muted-foreground">版本标签无法按稳定版本格式比较。</p>}
        <a href={repositoryUrl} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1.5 rounded-sm text-sm font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          <span className="break-all">GitHub · {repository}</span><ArrowUpRight className="size-4 shrink-0" aria-hidden />
        </a>
      </CardContent>
    </Card>
  );
}
