import { ImportWizard } from "@/components/admin/ImportWizard";
import { Main, PageHeader } from "@/components/layout/main";

export default function ImportPage() {
  return (
    <Main>
      <PageHeader
        title="导入书签"
        description="从浏览器导出的 HTML 批量导入，自动按文件夹建分类并去重。"
      />
      <ImportWizard />
    </Main>
  );
}
