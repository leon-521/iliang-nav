"use client";

import * as React from "react";
import { ChevronsUpDown, LogOut, ExternalLink } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export function NavUser({
  email,
  publicUrl,
}: {
  email: string;
  publicUrl?: string;
}) {
  const { isMobile, state } = useSidebar();
  const initial = email.slice(0, 1).toUpperCase();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              aria-label={`管理员账号：${email}`}
              className="h-auto gap-2.5 rounded-lg px-2 py-1.5 data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:justify-center"
              tooltip={state === "collapsed" && !isMobile ? email : undefined}
            >
              <Avatar className="size-8 shrink-0 rounded-lg">
                <AvatarFallback className="rounded-lg bg-primary text-primary-foreground text-xs">
                  {initial}
                </AvatarFallback>
              </Avatar>
              <div className="grid min-w-0 flex-1 text-start text-sm leading-tight group-data-[collapsible=icon]:hidden">
                <span className="truncate font-medium">管理员</span>
                <span className="truncate text-xs text-muted-foreground">
                  {email}
                </span>
              </div>
              <ChevronsUpDown className="ms-auto size-4 group-data-[collapsible=icon]:hidden" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-start text-sm">
                <Avatar className="size-8 rounded-lg">
                  <AvatarFallback className="rounded-lg bg-primary text-primary-foreground text-xs">
                    {initial}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 leading-tight">
                  <span className="truncate font-medium">管理员</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {email}
                  </span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {publicUrl ? (
              <>
                <DropdownMenuItem asChild>
                  <a href={publicUrl} target="_blank" rel="noreferrer">
                    <ExternalLink />
                    打开公开主页
                  </a>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            ) : null}
            {/*
             * 退出走 /logout 这个 Route Handler，用普通 <a>。
             *
             * 踩过三个坑，都记在这里：
             *  1. <form><button><DropdownMenuItem/></button></form>：菜单项渲染成
             *     div[role=menuitem]，塞进 <button> 是非法嵌套，菜单一关子树被
             *     卸载，表单没提交就被拆掉 —— 「点了没反应」。
             *  2. 直接调 Server Action：能跳转，但 destroySession 里若用
             *     headers().append 补发第二条 Set-Cookie 会抛
             *     「Headers cannot be modified」，整个 action 失败。
             *  3. Route Handler 里用 NextResponse.redirect(new URL("/", req.url))：
             *     反代后面 req.url 是内网地址，浏览器跳过去是白页。
             *
             * 所以：普通 GET + 服务端回 Set-Cookie 和相对 Location，最稳。
             */}
            <DropdownMenuItem asChild className="cursor-pointer">
              <a href="/logout">
                <LogOut />
                退出登录
              </a>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
