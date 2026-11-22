import { Download, Upload } from "lucide-react";
import { ImportWizard } from "@/components/admin/ImportWizard";
import { ExportPanel } from "@/components/admin/ExportPanel";
import { Main, PageHeader } from "@/components/layout/main";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { exportableCount } from "@/lib/export/service";
import { getViewer } from "@/lib/auth/session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function TransferPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  if ((await getViewer()).kind !== "admin") redirect("/login");
  const { tab } = await searchParams;
  const initialTab = tab === "export" ? "export" : "import";
  return (
    <Main>
      <PageHeader title="导入导出" description="迁移和整理书签，支持 JSON、CSV 和浏览器 HTML。" />
      <Tabs key={initialTab} defaultValue={initialTab} activationMode="manual" className="min-w-0 gap-4">
        <TabsList aria-label="导入导出方式">
          <TabsTrigger value="import"><Upload aria-hidden />导入</TabsTrigger>
          <TabsTrigger value="export"><Download aria-hidden />导出</TabsTrigger>
        </TabsList>
        <TabsContent value="import" forceMount className="min-w-0 space-y-4 rounded-xl border bg-card p-4 data-[state=inactive]:hidden sm:p-6">
          <div><h2 className="text-base font-semibold">导入书签</h2><p className="mt-1 text-sm text-muted-foreground">先预览，确认后合并，不覆盖已有书签。新增书签默认私有。</p></div>
          <ImportWizard />
        </TabsContent>
        <TabsContent value="export" className="min-w-0 space-y-4 rounded-xl border bg-card p-4 sm:p-6">
          <h2 className="text-base font-semibold">导出书签</h2>
          <ExportPanel count={exportableCount()} />
        </TabsContent>
      </Tabs>
    </Main>
  );
}
