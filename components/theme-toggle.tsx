"use client";

import { Check, Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { isPalette, PALETTES, THEME_OPTIONS, type Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const ICONS: Record<Theme, typeof Sun> = {
  system: Monitor,
  light: Sun,
  dark: Moon,
};

/**
 * 三态主题切换：跟随系统 / 浅色 / 深色。
 *
 * 触发器显示的是**当前选择**的图标而不是当前生效的外观 —— 选了「跟随系统」
 * 却显示月亮，用户会以为自己锁定了深色。系统态用显示器图标区分。
 */
export function ThemeToggle({
  className,
  align = "end",
}: {
  className?: string;
  align?: "start" | "center" | "end";
}) {
  const { theme, setTheme, palette, setPalette } = useTheme();
  const Current = ICONS[theme];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("size-9 text-muted-foreground hover:text-foreground", className)}
          aria-label={`主题：${THEME_OPTIONS.find((o) => o.value === theme)?.label}`}
          title="切换主题"
        >
          <Current className="size-4" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align={align} className="w-48">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          外观
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {THEME_OPTIONS.map((opt) => {
          const Icon = ICONS[opt.value];
          const active = theme === opt.value;
          return (
            <DropdownMenuItem
              key={opt.value}
              onClick={() => setTheme(opt.value)}
              className="gap-2.5"
            >
              <Icon className="size-4 text-muted-foreground" />
              <span className="flex-1">{opt.label}</span>
              <Check
                className={cn(
                  "size-3.5 text-accent transition-opacity",
                  active ? "opacity-100" : "opacity-0",
                )}
              />
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">主题配色</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={palette} onValueChange={(value) => { if (isPalette(value)) setPalette(value); }}>
          {Object.entries(PALETTES).map(([id, option]) => (
            <DropdownMenuRadioItem key={id} value={id} className="gap-2.5">
              <span className="size-3 shrink-0 rounded-full border" style={{ backgroundColor: option.swatch }} aria-hidden />
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
