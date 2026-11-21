"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { loginInlineAction, type InlineLoginState } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * 前台登录弹窗。
 *
 * 以前点「登录」要跳到独立的后台域名，回来后还得自己找回原页面。
 * 现在前后台同一个域名，就地弹窗；登录成功整页重载，
 * 服务端重新渲染，头像、新增按钮、退出菜单一次到位。
 *
 * 为什么不用 router.refresh()：登录成功的瞬间弹窗要卸载，
 * Radix 在过渡期卸载子树会抛 React #441（退出登录那次踩过同一个坑）。
 * 让浏览器重新请求一次页面最稳，代价只是刷新一下。
 */
export function LoginDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [state, formAction, pending] = React.useActionState<
    InlineLoginState,
    FormData
  >(loginInlineAction, null);
  const [leaving, setLeaving] = React.useState(false);

  React.useEffect(() => {
    if (!state?.ok) return;
    setLeaving(true);
    /*
     * 先让弹窗把这一帧画完（关闭动画/卸载）再刷新，
     * 否则 React 会在渲染过程中被卸载打断。
     * 刷新当前地址，所以 /quick-add?url=… 这类带参页面也能原地回来。
     */
    const t = window.setTimeout(() => window.location.reload(), 80);
    return () => window.clearTimeout(t);
  }, [state?.ok]);

  const busy = pending || leaving;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (busy) return;
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-[22rem]">
        <DialogHeader>
          <DialogTitle className="text-[17px]">登录</DialogTitle>
          <DialogDescription className="text-[12.5px]">
            登录后可以增删书签、管理分类和站点设置。
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="login-email" className="text-[12.5px]">
              邮箱
            </Label>
            <Input
              id="login-email"
              name="email"
              type="email"
              required
              autoComplete="username"
              autoFocus
              placeholder="admin@example.com"
              className="h-10"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <Label htmlFor="login-password" className="text-[12.5px]">
                密码
              </Label>
              {/*
               * 找回密码是独立页面：用户要去邮箱点链接，
               * 在弹窗里再套一层只会把流程打断。
               */}
              <a
                href="/forgot-password"
                className="text-[11.5px] text-muted-foreground underline-offset-2 transition-colors hover:text-primary hover:underline"
              >
                忘记密码？
              </a>
            </div>
            <Input
              id="login-password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="h-10"
            />
          </div>

          {state?.error ? (
            <p className="animate-fade-in rounded-lg bg-destructive/10 px-3 py-2 text-[12.5px] text-destructive">
              {state.error}
            </p>
          ) : null}

          <Button type="submit" className="h-10 w-full text-[13px]" disabled={busy}>
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                登录中…
              </>
            ) : (
              "登录"
            )}
          </Button>
        </form>

        <p className="text-center text-[11px] text-muted-foreground/70">
          连续 5 次失败会锁定 15 分钟
        </p>
      </DialogContent>
    </Dialog>
  );
}
