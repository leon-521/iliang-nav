import Link from "next/link";
import { Settings2 } from "lucide-react";
import { redirect } from "next/navigation";
import { asc } from "drizzle-orm";
import { AiBookmarkTools } from "@/components/admin/AiBookmarkTools";
import { Main, PageHeader } from "@/components/layout/main";
import { buttonVariants } from "@/components/ui/button";
import { getViewer } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { bookmarks } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export default async function AiToolsPage() {
  if ((await getViewer()).kind !== "admin") redirect("/login?next=/ai-tools");
  const rows = db.select({ id: bookmarks.id, title: bookmarks.title }).from(bookmarks)
    .orderBy(asc(bookmarks.sortOrder), asc(bookmarks.createdAt), asc(bookmarks.id)).all();

  return (
    <Main>
      <PageHeader title="AI 工具" description="从网页生成摘要、标签和分类建议。先预览，确认后才写入书签。">
        <Link href="/settings?tab=ai" className={buttonVariants({ variant: "outline" })}><Settings2 aria-hidden /> AI 供应商设置</Link>
      </PageHeader>
      <AiBookmarkTools rows={rows} />
    </Main>
  );
}
