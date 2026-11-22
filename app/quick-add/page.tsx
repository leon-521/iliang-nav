import type { Metadata } from "next";
import { getViewer } from "@/lib/auth/session";
import { listCategoryOptions } from "@/lib/categories/service";
import { QuickAddPanel } from "@/components/public/quick-add";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "收藏当前页面",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function QuickAddPage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string | string[]; title?: string | string[] }>;
}) {
  const [viewer, params] = await Promise.all([getViewer(), searchParams]);
  const isAdmin = viewer.kind === "admin";

  // Render inline authentication instead of redirecting: the capture is read once
  // in the browser and kept in this page's memory until the administrator signs in.
  return (
    <QuickAddPanel
      isAdmin={isAdmin}
      categories={isAdmin ? listCategoryOptions() : []}
      initialUrl={typeof params.url === "string" && params.url.length <= 2048 ? params.url : ""}
      initialTitle={typeof params.title === "string" ? params.title.slice(0, 300) : ""}
    />
  );
}
