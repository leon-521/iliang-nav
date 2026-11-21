import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth/session";
import { listCategoryOptions } from "@/lib/categories/service";
import { QuickAddPanel } from "@/components/public/quick-add";

export const dynamic = "force-dynamic";

/**
 * 书签小工具的落地页。
 *
 * 浏览器书签栏里存一段 javascript:，在任意页面点一下就带着
 * 当前地址和标题打开这个页面，弹窗已经填好，选个分类保存即可。
 *
 * 放在后台域（proxy 会把公开域的 /quick-add 改成 404）：
 * 这里要写库，属于后台操作，不能挂在公开域上。
 */
export const metadata: Metadata = {
  title: "收藏当前页面",
  robots: { index: false, follow: false },
};

export default async function QuickAddPage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string; title?: string }>;
}) {
  const viewer = await getViewer();
  const params = await searchParams;

  /*
   * 没登录时带上完整回跳地址去登录。
   * 只带 /login 的话，登录完会落在首页 —— 书签脚本带来的
   * 地址和标题全丢了，用户还得再点一次书签。
   */
  if (viewer.kind !== "admin") {
    const qs = new URLSearchParams();
    if (params.url) qs.set("url", params.url);
    if (params.title) qs.set("title", params.title);
    const suffix = qs.toString();
    const target = suffix ? `/quick-add?${suffix}` : "/quick-add";
    redirect(`/login?next=${encodeURIComponent(target)}`);
  }

  return (
    <QuickAddPanel
      categories={listCategoryOptions()}
      initialUrl={params.url ?? ""}
      initialTitle={params.title ?? ""}
    />
  );
}
