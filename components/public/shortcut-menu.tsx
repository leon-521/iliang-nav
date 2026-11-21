"use client";

import { Ellipsis, type LucideIcon } from "lucide-react";
import { ContextMenu } from "radix-ui";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export type ShortcutCommand = { label: string; icon: LucideIcon; run: () => void; disabled?: boolean; destructive?: boolean };

export function ShortcutMenu({ label, commands, children }: { label: string; commands: ShortcutCommand[]; children: React.ReactNode }) {
  return <ContextMenu.Root>
    <ContextMenu.Trigger asChild>
      <div className="relative min-w-0">
        {children}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" type="button" aria-label={`${label}的常用入口操作`} className="absolute end-1 top-1 bg-card/95 shadow-xs"><Ellipsis aria-hidden /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {commands.map(({ label, icon: Icon, run, disabled, destructive }) => <div key={label} role="none">
              {destructive && <DropdownMenuSeparator />}
              <DropdownMenuItem disabled={disabled} onSelect={run} variant={destructive ? "destructive" : "default"}><Icon aria-hidden />{label}</DropdownMenuItem>
            </div>)}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </ContextMenu.Trigger>
    <ContextMenu.Portal>
      <ContextMenu.Content className="z-50 max-h-(--radix-context-menu-content-available-height) min-w-44 overflow-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-md">
        {commands.map(({ label, icon: Icon, run, disabled, destructive }) => <div key={label} role="none">
          {destructive && <ContextMenu.Separator className="my-1 h-px bg-border" />}
          <ContextMenu.Item disabled={disabled} onSelect={run} className={`flex cursor-default items-center gap-2 rounded-md px-2 py-2 text-sm outline-none data-disabled:opacity-45 data-highlighted:bg-accent data-highlighted:text-accent-foreground ${destructive ? "text-destructive" : ""}`}>
            <Icon className="size-4" aria-hidden />{label}
          </ContextMenu.Item>
        </div>)}
      </ContextMenu.Content>
    </ContextMenu.Portal>
  </ContextMenu.Root>;
}
