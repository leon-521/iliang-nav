import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/auth/forgot-form";

export const metadata: Metadata = {
  title: "找回密码",
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return (
    <main className="relative flex min-h-viewport items-center justify-center bg-background px-4 py-10">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 opacity-[0.5] [background-image:linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [background-size:52px_52px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
      </div>
      <div className="relative w-full max-w-[22rem]">
        <ForgotPasswordForm />
      </div>
    </main>
  );
}
