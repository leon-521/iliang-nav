"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, GripVertical, X } from "lucide-react";
import {
  changePassword,
  saveSettings,
  type SettingsState,
} from "@/lib/settings/actions";
import { NEW_PASSWORD_HINT, NEW_PASSWORD_PATTERN } from "@/lib/auth/password-policy";
import type { SiteSettings } from "@/lib/settings/service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { displayTitle, hostOf } from "@/components/public/favicon";

export type QuickToolCandidate = {
  id: string;
  title: string;
  url: string;
  iconUrl: string | null;
};

export function Feedback({ state }: { state: SettingsState }) {
  if (!state) return null;
  if (state.error)
    return (
      <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
        {state.error}
      </p>
    );
  if (state.ok)
    return (
      <p className="flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="size-4" />
        已保存
      </p>
    );
  return null;
}

/**
 * 站点信息表单。
 *
 * 原来这里自己包了一层 Card（带标题「站点信息」和说明），
 * 设置页再把五张 Card 纵向摞起来 —— 于是每块都有各自的边框、
 * 内边距和标题，整页既长又碎。
 * 现在 Card 那层交给设置页的 AccordionItem（标题栏也归它），
 * 这里只负责表单内容本身。
 */
export function SettingsForm({
  initial,
  quickToolCandidates,
}: {
  initial: SiteSettings;
  quickToolCandidates: QuickToolCandidate[];
}) {
  const [state, setState] = React.useState<SettingsState>(null);
  const [pending, start] = React.useTransition();
  const [showIcons, setShowIcons] = React.useState(initial.showIcons);
  const [quickIds, setQuickIds] = React.useState<string[]>(initial.quickToolIds);

  const byId = React.useMemo(
    () => new Map(quickToolCandidates.map((c) => [c.id, c])),
    [quickToolCandidates],
  );

  /** 已选但书签已被删掉/转为非公开的，仍显示出来让用户知道 */
  const chosen = quickIds.map((id) => byId.get(id) ?? { id, title: "（已失效）", url: "", iconUrl: null });
  const remaining = quickToolCandidates.filter((c) => !quickIds.includes(c.id));

  const add = (id: string) => {
    setQuickIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  };
  const remove = (id: string) => {
    setQuickIds((prev) => prev.filter((x) => x !== id));
  };
  const move = (id: string, dir: -1 | 1) => {
    setQuickIds((prev) => {
      const i = prev.indexOf(id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        if (showIcons) fd.set("showIcons", "on");
        fd.set("quickToolIds", quickIds.join(","));
        start(async () => setState(await saveSettings(null, fd)));
      }}
      className="space-y-4"
    >
      <div className="space-y-2">
        <Label htmlFor="siteName">站点名称</Label>
        <Input
          id="siteName"
          name="siteName"
          defaultValue={initial.siteName}
          maxLength={40}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="siteTagline">副标题</Label>
        <Input
          id="siteTagline"
          name="siteTagline"
          defaultValue={initial.siteTagline}
          maxLength={80}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="ownerName">称呼</Label>
        <Input
          id="ownerName"
          name="ownerName"
          defaultValue={initial.ownerName}
          maxLength={20}
          placeholder="留空则显示「欢迎回来」"
        />
        <p className="text-xs text-muted-foreground">
          显示在首页问候语里，例如「早上好，设计师」。
        </p>
      </div>

      <Separator />

      <div className="flex items-center justify-between gap-4">
        <div className="space-y-0.5">
          <Label htmlFor="showIcons">显示图标</Label>
          <p className="text-xs text-muted-foreground">
            关闭后首页只显示文字，加载更快。
          </p>
        </div>
        <Switch
          id="showIcons"
          checked={showIcons}
          onCheckedChange={setShowIcons}
        />
      </div>

      <Separator />

      {/* 常用工具：前台首页那一排快捷入口 */}
      <div className="space-y-2.5">
        <div className="space-y-0.5">
          <Label>常用工具</Label>
          <p className="text-xs text-muted-foreground">
            首页顶部那一排快捷入口。不选则自动显示「点击最多的 8 个」。
            最多 12 个，按下面的顺序展示。
          </p>
        </div>

        {chosen.length > 0 ? (
          <ul className="space-y-1.5">
            {chosen.map((c, i) => (
              <li
                key={c.id}
                className="flex items-center gap-2 rounded-md border bg-muted/30 px-2 py-1.5"
              >
                <span className="flex flex-col">
                  <button
                    type="button"
                    onClick={() => move(c.id, -1)}
                    disabled={i === 0}
                    aria-label={`把 ${c.title} 上移`}
                    className="text-[9px] leading-none text-muted-foreground/60 hover:text-foreground disabled:opacity-25"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    onClick={() => move(c.id, 1)}
                    disabled={i === chosen.length - 1}
                    aria-label={`把 ${c.title} 下移`}
                    className="text-[9px] leading-none text-muted-foreground/60 hover:text-foreground disabled:opacity-25"
                  >
                    ▼
                  </button>
                </span>
                <span className="w-4 shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground/60">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px]">
                  {c.url ? displayTitle(c.title, c.url) : c.title}
                </span>
                <span className="hidden max-w-[9rem] shrink-0 truncate font-mono text-[11px] text-muted-foreground sm:block">
                  {c.url ? hostOf(c.url) : ""}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => remove(c.id)}
                  aria-label={`移除 ${c.title}`}
                  className="size-6 shrink-0 p-0 text-muted-foreground hover:text-destructive"
                >
                  <X className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
            还没选，前台按点击量自动取前 8 个。
          </p>
        )}

        {remaining.length > 0 ? (
          <details className="rounded-md border">
            <summary className="cursor-pointer px-3 py-2 text-xs text-muted-foreground">
              从公开书签里添加（{remaining.length} 个可选）
            </summary>
            <ul className="max-h-56 space-y-0.5 overflow-y-auto border-t p-1.5">
              {remaining.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => add(c.id)}
                    disabled={quickIds.length >= 12}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-start text-[13px] transition-colors hover:bg-secondary disabled:opacity-40"
                  >
                    <GripVertical className="size-3 shrink-0 text-muted-foreground/40" />
                    <span className="min-w-0 flex-1 truncate">
                      {displayTitle(c.title, c.url)}
                    </span>
                    <span className="max-w-[8rem] shrink-0 truncate font-mono text-[11px] text-muted-foreground">
                      {hostOf(c.url)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>

      <Feedback state={state} />

      <Button type="submit" disabled={pending}>
        {pending ? "保存中…" : "保存设置"}
      </Button>
    </form>
  );
}

export function PasswordForm() {
  const router = useRouter();
  const [state, setState] = React.useState<SettingsState>(null);
  const [pending, start] = React.useTransition();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        start(async () => {
          const res = await changePassword(null, fd);
          setState(res);
          if (res?.ok) {
            // 会话已销毁，跳回登录页
            router.push("/login");
            router.refresh();
          }
        });
      }}
      className="space-y-4"
    >
      <div className="space-y-2">
        <Label htmlFor="currentPassword">当前密码</Label>
        <Input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="newPassword">新密码</Label>
          <Input
            id="newPassword"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            pattern={NEW_PASSWORD_PATTERN}
            title={NEW_PASSWORD_HINT}
            required
          />
          <p className="text-xs text-muted-foreground">{NEW_PASSWORD_HINT}</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirmPassword">确认新密码</Label>
          <Input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            pattern={NEW_PASSWORD_PATTERN}
            title={NEW_PASSWORD_HINT}
            required
          />
        </div>
      </div>

      <Feedback state={state} />

      <Button type="submit" variant="destructive" disabled={pending}>
        {pending ? "更新中…" : "更新密码"}
      </Button>
    </form>
  );
}
