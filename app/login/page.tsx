"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { Bookmark, CheckCircle2, Loader2 } from "lucide-react";
import { loginAction, type LoginState } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(
    loginAction,
    null,
  );
  /*
   * 登录后回跳目标。一键收藏的落地页会带过来，
   * 没登录时被踢到登录页，登完必须回到原来那页。
   * 用 useSearchParams 要包 Suspense，所以这里改成读 location ——
   * 登录页是静态预渲染的，不能因为读 searchParams 变成动态。
   */
  const [next, setNext] = useState("");
  /** 从重置密码页跳回来时带 ?reset=1，展示一次成功提示 */
  const [resetDone, setResetDone] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const value = params.get("next") ?? "";
    if (value.startsWith("/") && !value.startsWith("//")) setNext(value);
    if (params.get("reset") === "1") {
      setResetDone(true);
      // 提示只出现一次：把参数从地址栏抹掉，刷新后不再重复
      window.history.replaceState(null, "", "/login");
    }
  }, []);

  return (
    /*
     * 居中三件套：min-h-viewport + items-center + py。
     *
     * 不用 min-h-screen：100vh 在手机上是「地址栏收起」的高度，
     * 比实际可见区域高，内容看起来整体偏下。
     *
     * 也不能给 main 加 overflow-hidden：内容比视口高时，
     * flex 居中会把顶部裁掉且无法滚动。装饰层自己包一层 overflow-hidden 就行。
     */
    <main className="relative flex min-h-viewport items-center justify-center bg-background px-4 py-10">
      {/* 背景：极淡网格 + 中心绿光，跟前台保持同一套语言 */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 opacity-[0.5] [background-image:linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [background-size:52px_52px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
        <div className="absolute left-1/2 top-1/2 size-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/[0.06] blur-3xl" />
      </div>

      <div className="relative w-full max-w-[22rem] animate-fade-up">
        <div className="mb-7 flex items-center gap-2.5">
          <span className="flex size-10 items-center justify-center rounded-[11px] bg-primary text-primary-foreground shadow-[0_3px_12px_-3px_color-mix(in_oklab,var(--primary)_60%,transparent)]">
            <Bookmark className="size-5" fill="currentColor" strokeWidth={0} />
          </span>
          <div className="min-w-0">
            <p className="text-[17px] font-semibold leading-tight tracking-tight">
              iliang nav
            </p>
            <p className="mt-1 text-[11px] leading-none text-muted-foreground">
              书签管理后台
            </p>
          </div>
        </div>

        <form
          action={formAction}
          className="rounded-2xl border border-border bg-card p-6 shadow-[0_1px_2px_rgba(26,32,43,0.04),0_8px_24px_-12px_rgba(26,32,43,0.10)]"
        >
          <input type="hidden" name="next" value={next} />
          <div className="mb-5">
            <h1 className="text-[19px] font-semibold tracking-tight">登录</h1>
            <p className="mt-1 text-[12.5px] text-muted-foreground">
              仅限管理员账号访问
            </p>
          </div>

          {resetDone ? (
            <p className="animate-fade-in mb-4 flex items-start gap-2 rounded-lg bg-primary/10 px-3 py-2 text-[12.5px] leading-relaxed text-primary">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
              <span>密码已更新，请用新密码登录。其它设备上的旧登录已失效。</span>
            </p>
          ) : null}

          <div className="space-y-4">
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
                placeholder="admin@example.com"
                className="h-10"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between">
                <Label htmlFor="password" className="text-[12.5px]">
                  密码
                </Label>
                {/*
                 * 找回密码是独立页面，不塞进弹窗：要看邮件、开新标签，
                 * 弹窗套弹窗体验很差。带上 next，找回后还能回原来那页。
                 */}
                <Link
                  href={
                    next
                      ? `/forgot-password?next=${encodeURIComponent(next)}`
                      : "/forgot-password"
                  }
                  className="text-[11.5px] text-muted-foreground underline-offset-2 transition-colors hover:text-primary hover:underline"
                >
                  忘记密码？
                </Link>
              </div>
              <Input
                id="password"
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

            <Button
              type="submit"
              className="h-10 w-full text-[13px]"
              disabled={pending}
            >
              {pending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  登录中…
                </>
              ) : (
                "登录"
              )}
            </Button>
          </div>
        </form>

        <p className="mt-4 text-center text-[11px] text-muted-foreground/70">
          连续 5 次失败将锁定 15 分钟
        </p>
      </div>
    </main>
  );
}
