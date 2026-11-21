"use client";

import * as React from "react";
import {
  DatabaseBackup,
  Download,
  KeyRound,
  Mail,
  MousePointerClick,
  Settings2,
  type LucideIcon,
} from "lucide-react";
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

/**
 * 图标按名字查表，而不是直接传组件。
 *
 * 设置页是服务端组件，这里（以及 ui/accordion）是客户端组件。
 * 直接把 lucide 图标当 prop 传过去会被 Next 拦下 ——
 * 图标本质是个函数，函数不能跨服务端/客户端边界序列化，
 * 运行时会报 "Functions cannot be passed directly to Client Components"。
 * 传字符串、在客户端这侧查表就没这个问题。
 */
const ICONS = {
  site: Settings2,
  mail: Mail,
  bookmarklet: MousePointerClick,
  backup: DatabaseBackup,
  export: Download,
  password: KeyRound,
} satisfies Record<string, LucideIcon>;

export type SettingsSectionIcon = keyof typeof ICONS;

/**
 * 设置页的一个可折叠区块。
 *
 * 设置页原来是把五张卡片纵向摞起来，其中「邮件服务」一张就有
 * SMTP 五项 + 模板三项 + 测试发信，整页要滚好几屏，
 * 想改个站点名得先滚过一堆不相干的输入框。
 *
 * 现在每块收进手风琴：默认只展开第一块，其余点标题展开。
 * 标题栏同时放图标和一句说明，收起状态也知道这块是干什么的。
 */
export function SettingsSection({
  value,
  icon,
  title,
  description,
  children,
}: {
  value: string;
  icon: SettingsSectionIcon;
  title: string;
  /** 收起时也显示的一句说明，别写太长，一行能放下最好 */
  description?: string;
  children: React.ReactNode;
}) {
  const Icon = ICONS[icon];

  return (
    <AccordionItem value={value}>
      <AccordionTrigger>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
          <Icon className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{title}</span>
          {description ? (
            <span className="mt-0.5 block text-[12px] leading-relaxed text-muted-foreground">
              {description}
            </span>
          ) : null}
        </span>
      </AccordionTrigger>
      <AccordionContent className="ps-11">{children}</AccordionContent>
    </AccordionItem>
  );
}
