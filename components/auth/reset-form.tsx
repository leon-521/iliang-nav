"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { NEW_PASSWORD_HINT, NEW_PASSWORD_PATTERN } from "@/lib/auth/password-policy";
import { resetPasswordAction, type ResetState } from "@/lib/auth/reset-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * 忘记密码 · 第二步：凭 token 设新密码。
 *
 * 改完 session_version +1，所有旧会话立即失效；
 * 服务端顺手清掉当前浏览器的 cookie，避免停在半登录状态。
 */
export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = React.useActionState<ResetState, FormData>(
    resetPasswordAction,
    null,
  );

  /*
   * 成功态不在本页渲染：action 里直接 redirect 到 /login?reset=1。
   * 原因见 resetPasswordAction —— 令牌一被消费，本页再渲染就是「链接已失效」。
   */

  return (
    <div className="animate-fade-up rounded-2xl border border-border bg-card p-6 shadow-[0_1px_2px_rgba(26,32,43,0.04),0_8px_24px_-12px_rgba(26,32,43,0.10)]">
      <div className="mb-5">
        <h1 className="text-[19px] font-semibold tracking-tight">设置新密码</h1>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
          {NEW_PASSWORD_HINT}。设置后所有设备都需要重新登录。
        </p>
      </div>

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="token" value={token} />

        <div className="space-y-1.5">
          <Label htmlFor="password" className="text-[12.5px]">
            新密码
          </Label>
          <Input
            id="password"
            name="password"
            type="password"
            required
            pattern={NEW_PASSWORD_PATTERN}
            title={NEW_PASSWORD_HINT}
            autoComplete="new-password"
            autoFocus
            className="h-10"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="confirm" className="text-[12.5px]">
            再输一次
          </Label>
          <Input
            id="confirm"
            name="confirm"
            type="password"
            required
            pattern={NEW_PASSWORD_PATTERN}
            title={NEW_PASSWORD_HINT}
            autoComplete="new-password"
            className="h-10"
          />
        </div>

        {state?.error ? (
          <p className="animate-fade-in rounded-lg bg-destructive/10 px-3 py-2 text-[12.5px] leading-relaxed text-destructive">
            {state.error}
          </p>
        ) : null}

        <Button type="submit" className="h-10 w-full text-[13px]" disabled={pending}>
          {pending ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              保存中…
            </>
          ) : (
            "保存新密码"
          )}
        </Button>
      </form>

      <p className="mt-4 text-center text-[11px] text-muted-foreground/70">
        链接 30 分钟内有效，且只能用一次
      </p>
    </div>
  );
}
