"use client";

import * as React from "react";
import { FileDown } from "lucide-react";

/**
 * 书签导出。
 *
 * 只做一件事：点一下把全部书签下载成 Netscape 格式的 HTML。
 * 不做「选择分类导出」这类花活 —— 导出是为了「随时能带走」，
 * 少一个选项就少一个能出错的环节。
 *
 * 用普通 <a download> 而不是 fetch + blob：
 *  - 浏览器原生处理「另存为」，进度和断点都由它管；
 *  - 不用把整个文件读进内存再拼 Blob；
 *  - 出错时（401）浏览器会直接显示，不会变成一个静默的空文件。
 */
export function ExportPanel({ count }: { count: number }) {
  return (
    <div className="space-y-3">
      <p className="text-[12.5px] leading-relaxed text-muted-foreground">
        导出为浏览器通用的书签文件（Netscape 格式）。
        下载后可以直接导入 Chrome、Edge、Firefox、Safari，
        书签的分类层级会原样保留。
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <a
          href="/api/export"
          download
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <FileDown className="size-4" />
          导出全部书签
        </a>
        <span className="text-[12px] text-muted-foreground">
          共 {count} 条，含私有书签
        </span>
      </div>

      <p className="text-[12px] leading-relaxed text-muted-foreground">
        建议定期导出一份留底 —— 数据在你自己手上，比存在任何服务器上都可靠。
      </p>
    </div>
  );
}
