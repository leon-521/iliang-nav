import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { ImportWizard } from "@/components/admin/ImportWizard";
import { Main, PageHeader } from "@/components/layout/main";

export default function ImportPage() {
  return (
    <Main>
      <PageHeader
        title="导入书签"
        description="支持 JSON、CSV、浏览器 HTML；先预览，确认后合并，不覆盖已有书签。"
      >
        <Link href="/settings?tab=export" className={buttonVariants({ variant: "outline" })}>导出书签</Link>
      </PageHeader>
      <ImportWizard />
    </Main>
  );
}
