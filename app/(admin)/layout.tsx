import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth/session";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { Header } from "@/components/layout/header";

/** 后台一律不进搜索引擎；proxy 还会额外加 X-Robots-Tag 头兜底 */
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const viewer = await getViewer();
  if (viewer.kind !== "admin") redirect("/login");

  return (
    /*
     * 侧栏宽度对齐前台（15rem）。默认的 16rem 与前台差 1rem，
     * 两边来回切会看到导航宽度跳一下，像两个产品。
     */
    <SidebarProvider style={{ "--sidebar-width": "15rem" } as React.CSSProperties}>
      <AppSidebar
        email={viewer.email}
        publicUrl={process.env.PUBLIC_BASE_URL}
      />
      <SidebarInset className="min-w-0">
        <Header />
        <div className="flex min-w-0 flex-1 flex-col">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
