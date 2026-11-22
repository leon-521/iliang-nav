import { CloudUpload, DatabaseBackup, KeyRound, Mail, MousePointerClick, Plug, Settings2, Sparkles } from "lucide-react";
import { getSettings } from "@/lib/settings/service";
import { listBackups } from "@/lib/backup/service";
import { getMailDisplay } from "@/lib/mail/config";
import { Main, PageHeader } from "@/components/layout/main";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PasswordForm, SettingsForm } from "@/components/admin/SettingsForms";
import { MailSettingsForm } from "@/components/admin/MailSettings";
import { BackupPanel } from "@/components/admin/BackupPanel";
import { BookmarkletPanel } from "@/components/admin/BookmarkletPanel";
import { redirect } from "next/navigation";
import { AiSettings } from "@/components/admin/AiSettings";
import { McpSettings } from "@/components/admin/McpSettings";
import { WebDavSettings } from "@/components/admin/WebDavSettings";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookmarks } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  const { tab } = await searchParams;
  if (tab === "export") redirect("/import?tab=export");
  const settings = getSettings();
  const candidates = db
    .select({ id: bookmarks.id, title: bookmarks.title, url: bookmarks.url, iconUrl: bookmarks.iconUrl })
    .from(bookmarks)
    .where(eq(bookmarks.effectiveVisibility, "public"))
    .orderBy(asc(bookmarks.title))
    .all();

  const sections = [
    { id: "site", title: "站点信息", icon: Settings2, description: "站点名称、副标题、首页图标与常用工具。", content: <SettingsForm initial={settings} quickToolCandidates={candidates} /> },
    { id: "ai", title: "AI 供应商", icon: Sparkles, description: "配置用于书签检测、信息补全和分类建议的 AI 接口。", content: <AiSettings /> },
    { id: "mail", title: "邮件服务", icon: Mail, description: "SMTP 与重置密码邮件模板。", content: <MailSettingsForm mail={getMailDisplay()} template={{ mailSubject: settings.mailSubject, mailText: settings.mailText, mailHtml: settings.mailHtml }} /> },
    { id: "bookmarklet", title: "一键收藏", icon: MousePointerClick, description: "拖到浏览器书签栏，在任意网页一键保存书签。", content: <BookmarkletPanel baseUrl={process.env.PUBLIC_BASE_URL} /> },
    { id: "backup", title: "数据备份", icon: DatabaseBackup, description: "生成快照、下载或恢复到某个备份。", content: <BackupPanel initial={listBackups()} /> },
    { id: "webdav", title: "WebDAV", icon: CloudUpload, description: "配置远程 WebDAV 与自动备份间隔。", content: <WebDavSettings /> },
    { id: "mcp", title: "MCP", icon: Plug, description: "为 AI 客户端授予独立的书签管理权限。", content: <McpSettings /> },
    { id: "password", title: "修改密码", icon: KeyRound, description: "修改密码后，所有设备上的登录状态会失效。", content: <PasswordForm /> },
  ];

  return (
    <Main>
      <PageHeader title="设置" description="管理站点、AI 供应商、数据与账号安全。" />
      <Tabs key={typeof tab === "string" ? tab : "site"} defaultValue={sections.find(({ id }) => id === tab)?.id ?? "site"} activationMode="manual" className="min-w-0 gap-4">
        <div className="min-w-0 overflow-x-auto px-1 py-1">
          <TabsList aria-label="设置分类" className="min-h-11 w-max gap-1">
            {sections.map(({ id, title, icon: Icon }) => (
              <TabsTrigger key={id} value={id} className="h-9 px-3 data-[state=active]:text-indigo-ink">
                <Icon aria-hidden />{title}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        {sections.map(({ id, title, description, content }) => (
          <TabsContent key={id} value={id} className="min-w-0 rounded-xl border bg-card p-4 focus-visible:outline-2 focus-visible:outline-ring sm:p-6">
            <h2 className="text-base font-semibold">{title}</h2>
            <p className="mb-5 mt-1 text-sm text-muted-foreground">{description}</p>
            {content}
          </TabsContent>
        ))}
      </Tabs>
    </Main>
  );
}
