import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/auth/reset-form";
import { verifyResetToken } from "@/lib/auth/reset";

export const metadata: Metadata = {
  title: "设置新密码",
  robots: { index: false, follow: false },
};

/**
 * token 在服务端先校验一次：
 * 无效或过期就直接给出提示页，不必让用户填完两遍密码才被拒绝。
 * 真正的写入仍在 Server Action 里再验一遍（令牌可能在这一分钟里被用掉）。
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = "" } = await searchParams;
  const target = token ? verifyResetToken(token) : null;

  return (
    <main className="relative flex min-h-viewport items-center justify-center bg-background px-4 py-10">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 opacity-[0.5] [background-image:linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [background-size:52px_52px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
        <div className="absolute left-1/2 top-1/2 size-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/[0.06] blur-3xl" />
      </div>

      <div className="relative w-full max-w-[22rem]">
        {target ? (
          <ResetPasswordForm token={token} />
        ) : (
          <div className="rounded-2xl border border-border bg-card p-6 text-center shadow-[0_1px_2px_rgba(26,32,43,0.04),0_8px_24px_-12px_rgba(26,32,43,0.10)]">
            <h1 className="text-[18px] font-semibold tracking-tight">链接已失效</h1>
            <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">
              这个重置链接不存在、已过期，或者已经被使用过。
              重置链接 30 分钟内有效，且只能用一次。
            </p>
            <a
              href="/forgot-password"
              className="mt-5 inline-flex h-10 w-full items-center justify-center rounded-lg bg-primary text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              重新申请一封
            </a>
            <a
              href="/login"
              className="mt-2 inline-flex h-10 w-full items-center justify-center rounded-lg border border-border text-[13px] transition-colors hover:bg-secondary"
            >
              返回登录
            </a>
          </div>
        )}
      </div>
    </main>
  );
}
