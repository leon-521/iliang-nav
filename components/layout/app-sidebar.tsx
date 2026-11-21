"use client";

import Link from "next/link";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { NavGroup } from "./nav-group";
import { NavUser } from "./nav-user";
import { navGroups } from "./nav-data";

/**
 * 后台侧栏。
 *
 * 视觉规范与前台 components/public/nav-sidebar.tsx 对齐：
 *   - 平面式（variant="sidebar"），不再是 inset 的圆角卡片
 *   - 同样的 15rem 宽度、px-4 py-5 内边距
 *   - 同样的 Logo 尺寸与字号层级
 *
 * 之前两边是两套设计语言（前台自定义 NavRow 13px/40px 行高，
 * 后台 shadcn 默认 14px/32px），来回切像换了个产品。
 */
export function AppSidebar({
  email,
  publicUrl,
}: {
  email: string;
  publicUrl?: string;
}) {
  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader className="px-4 py-5 group-data-[collapsible=icon]:px-1">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip="管理概览" className="h-auto p-0 hover:bg-transparent group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:justify-center">
              <Link href="/dashboard" aria-label="管理概览" className="group flex items-center gap-2.5">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-primary text-primary-foreground group-data-[collapsible=icon]:size-8">
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="size-[18px]" fill="currentColor">
                    <path d="M6 2h12a2 2 0 0 1 2 2v18l-8-5-8 5V4a2 2 0 0 1 2-2z" />
                  </svg>
                </div>
                <div className="grid min-w-0 flex-1 text-start leading-none group-data-[collapsible=icon]:hidden">
                  <span className="truncate text-[17px] font-semibold tracking-tight">
                    iliang nav
                  </span>
                  <span className="mt-1 truncate text-[10.5px] font-normal text-muted-foreground">
                    书签管理后台
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="gap-0 px-4 group-data-[collapsible=icon]:px-1 group-data-[collapsible=icon]:overflow-y-auto no-scrollbar">
        {navGroups.map((group) => (
          <NavGroup key={group.title} {...group} />
        ))}
      </SidebarContent>

      <SidebarFooter className="px-4 pb-5 group-data-[collapsible=icon]:px-1">
        <NavUser email={email} publicUrl={publicUrl} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
