import { FileDown } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

const formats = [
  { key: "json", name: "JSON", detail: "书签、标签、多级分类及顺序；附带有限的站点展示设置，不包含凭据或图标文件。" },
  { key: "csv", name: "CSV", detail: "适合表格软件。保留书签字段、分类路径及标签，不包含空分类和站点设置。" },
  { key: "html", name: "HTML", detail: "浏览器通用 Netscape 格式，供 Chrome、Edge、Firefox、Safari 等导入。" },
] as const;

export function ExportPanel({ count }: { count: number }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">共 {count} 条，含私有书签。下载文件请妥善保管。</p>
      <div className="grid gap-3 lg:grid-cols-3">
        {formats.map(({ key, name, detail }) => (
          <div key={key} className="flex min-w-0 flex-col items-start gap-2 rounded-lg border p-3">
            <strong className="text-sm">{name}</strong>
            <p className="flex-1 text-xs leading-relaxed text-muted-foreground">{detail}</p>
            <a href={`/api/export?format=${key}`} download className={buttonVariants({ variant: "outline", size: "sm" })}>
              <FileDown aria-hidden className="size-4" />导出 {name}
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
