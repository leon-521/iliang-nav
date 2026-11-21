import { SidebarBody } from "./nav-sidebar";
import { Topbar } from "./topbar";
import { MobileTabbar } from "./mobile-tabbar";
import { LoginLauncher } from "./login-launcher";
import type { Crumb } from "@/components/layout/breadcrumbs";
import type { PublicView } from "@/lib/public/service";

/**
 * 前台外壳：左侧固定侧栏（lg 以上）+ 顶部栏 + 内容区。
 *
 * 移动端侧栏收进抽屉（Topbar 里的 MobileSidebar 负责），
 * 底部固定 Tab 栏做一级导航，内容区单栏。
 */
export function PublicShell({
  view,
  crumb,
  crumbParents,
  searchQuery,
  wide = false,
  children,
}: {
  view: PublicView;
  /** 顶栏面包屑的当前页名；不传则按路由推断 */
  crumb?: string;
  /** 多级分类的上级路径（不含当前页），不传则面包屑只到一级 */
  crumbParents?: Crumb[];
  searchQuery?: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  const { settings, total, categories, isAdmin, categoryOptions } = view;

  /*
   * 侧栏直接拿原始分类列表（带 parentId），层级交给
   * components/public/nav-sidebar.tsx 的 CategoryTree 自己拼。
   *
   * 原来在这里拍平成一维数组 + depth，是因为侧栏只会从上往下排。
   * 改成折叠式之后，拍平反而丢掉了「谁是谁的子级」这层关系，
   * 得靠 depth 反推，遇到多层分类就对不上了。
   */
  const sidebarCategories = categories;

  const avatarLabel = (settings.ownerName || "L").trim().charAt(0).toUpperCase();

  return (
    <div className="min-h-svh bg-background text-foreground">
      <div className="flex">
        {/* 桌面侧栏 */}
        <aside className="sticky top-0 hidden h-svh w-[212px] shrink-0 min-[1440px]:w-[232px] border-e border-sidebar-border bg-sidebar lg:block">
          <SidebarBody
            siteName={settings.siteName}
            siteTagline={settings.siteTagline}
            total={total}
            categories={sidebarCategories}
            isAdmin={isAdmin}
            categoryOptions={categoryOptions}
          />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar
            siteName={settings.siteName}
            siteTagline={settings.siteTagline}
            total={total}
            categories={sidebarCategories}
            isAdmin={isAdmin}
            avatarLabel={avatarLabel}
            crumb={crumb}
            crumbParents={crumbParents}
            searchQuery={searchQuery}
            categoryOptions={categoryOptions}
            baseUrl={process.env.PUBLIC_BASE_URL}
          />

          {/* pb 给移动端底部 Tab 栏留位，否则最后一行会被挡住 */}
          <main className={`flex-1 pb-24 pt-6 lg:pb-10 lg:pt-7 ${wide ? "mx-auto w-full min-w-0 px-4 sm:px-6 xl:w-[96%]" : "px-4 sm:px-6 lg:px-9"}`}>
            <div className={wide ? "w-full" : "mx-auto w-full max-w-[1320px]"}>{children}</div>
          </main>

          <footer className="hidden border-t border-border px-9 py-4 lg:block">
            <div className="mx-auto w-full max-w-[1320px] text-sm text-muted-foreground">
              <span>
                © {new Date().getFullYear()} {settings.siteName} · 个人书签工作台
              </span>
              </div>
          </footer>
        </div>
      </div>

      <MobileTabbar isAdmin={isAdmin} />

      {/* 登录弹窗的唯一宿主：侧栏 / 顶栏 / Tab 栏都通过事件把它叫起来 */}
      <LoginLauncher />
    </div>
  );
}
