"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import type { NavGroupData } from "./nav-data";

/**
 * 后台侧栏的一组导航。
 *
 * 尺寸/圆角/字号照抄前台 NavRow（components/public/nav-sidebar.tsx）：
 * 40px 行高、13px 字、rounded-lg、px-3、图标 15px。
 * 用 className 覆盖 shadcn 默认值（32px / 14px / rounded-md），
 * 而不是改 ui/sidebar.tsx —— 那个文件是通用原语，别为单个页面改基线。
 */
export function NavGroup({ title, items }: NavGroupData) {
  const pathname = usePathname();
  const { setOpenMobile, isMobile, state } = useSidebar();

  return (
    <SidebarGroup className="px-0 py-1">
      <SidebarGroupLabel className="mb-1.5 h-auto px-3 py-0 text-[10.5px] font-medium tracking-wide text-muted-foreground group-data-[collapsible=icon]:hidden">
        {title}
      </SidebarGroupLabel>
      <SidebarMenu className="gap-0.5">
        {items.map((item) => {
          const active =
            item.url === "/" ? pathname === "/" : pathname.startsWith(item.url);
          const Icon = item.icon;

          return (
            <SidebarMenuItem key={item.url}>
              <SidebarMenuButton
                asChild
                isActive={active}
                tooltip={state === "collapsed" && !isMobile ? item.title : undefined}
                className="h-10 gap-2.5 rounded-lg px-3 text-[13px] font-normal data-[active=true]:font-medium [&>svg]:size-[15px] group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:[&>svg]:size-[18px] group-data-[collapsible=icon]:p-0!"
              >
                <Link href={item.url} aria-label={item.title} aria-current={active ? "page" : undefined} onClick={() => setOpenMobile(false)}>
                  {Icon ? <Icon /> : null}
                  <span className="flex-1 truncate group-data-[collapsible=icon]:hidden">{item.title}</span>
                  {item.badge ? (
                    <Badge
                      variant="secondary"
                      className="ms-auto rounded-full px-1.5 py-0 text-[10px] tabular-nums group-data-[collapsible=icon]:hidden"
                    >
                      {item.badge}
                    </Badge>
                  ) : null}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}
