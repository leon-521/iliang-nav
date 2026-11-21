"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Loader2, Mail } from "lucide-react";
import { requestResetAction, type ResetState } from "@/lib/auth/reset-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * 忘记密码 · 第一步：填邮箱，收重置链接。
 *
 * 不区分「邮箱不存在」和「已发送」：两者都返回同一句提示。
 * 单用户站点虽然不容易被枚举，但把「这个邮箱存在」当免费情报送出去没有意义。
 */
export function ForgotPasswordForm() {
  const [state, formAction, pending] = React.useActionState<ResetState, FormData>(
    requestResetAction,
    null,
  );

  const [next, setNext] = React.useState("");
  React.useEffect(() => {
    const v = new URLSearchParams(window.location.search).get("next") ?? "";
    if (v.startsWith("/") && !v.startsWith("//")) setNext(v);
  }, []);

  const backHref = next ? `/login?next=${encodeURIComponent(next)}` : "/login";

  return (
    <div className="animate-fade-up rounded-2xl border border-border bg-card p-6 shadow-[0_1px_2px_rgba(26,32,43,0.04),0_8px_24px_-12px_rgba(26,32,43,0.10)]">
      <div className="mb-5">
        <h1 className="text-[19px] font-semibold tracking-tight">找回密码</h1>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
          填注册时用的邮箱，我们会发一封带重置链接的邮件，30 分钟内有效。
        </p>
      </div>

      {state?.ok ? (
        <div className="space-y-4">
          <div className="flex items-start gap-2.5 rounded-lg bg-primary/8 px-3 py-2.5 text-[12.5px] leading-relaxed text-foreground">
            <Mail className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>{state.message}</span>
          </div>
          <p className="text-[11.5px] leading-relaxed text-muted-foreground">
            没收到？先看垃圾箱；也可以{" "}
            <Link
              href="/forgot-password"
              className="text-primary underline-offset-2 hover:underline"
            >
              重新发送
            </Link>
            。
          </p>
          <Link
            href={backHref}
            className="flex h-10 w-full items-center justify-center rounded-lg border border-border text-[13px] transition-colors hover:bg-secondary"
          >
            返回登录
          </Link>
        </div>
      ) : (
        <form action={formAction} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-[12.5px]">
              邮箱
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="username"
              autoFocus
              placeholder="admin@example.com"
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
                发送中…
              </>
            ) : (
              "发送重置邮件"
            )}
          </Button>

          <Link
            href={backHref}
            className="flex items-center justify-center gap-1 text-[11.5px] text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3" />
            返回登录
          </Link>
        </form>
      )}

      <p className="mt-4 text-center text-[11px] leading-relaxed text-muted-foreground/70">
        同一 IP 15 分钟内最多申请 3 次
      </p>

      {state?.ok ? (
        <CheckCircle2 className="hidden" aria-hidden />
      ) : null}
    </div>
  );
}
