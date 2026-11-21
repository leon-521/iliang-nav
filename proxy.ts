import { NextResponse, type NextRequest } from "next/server";

/** 后台路径：这些页面不该进搜索引擎 */
const ADMIN_PATHS = [
  "/login",
  "/forgot-password",
  "/reset-password",
  "/dashboard",
  "/bookmarks",
  "/ai-tools",
  "/categories",
  "/import",
  "/settings",
  /* 书签小工具的落地页：要写库，属于后台 */
  "/quick-add",
];

function isAdminPath(pathname: string) {
  return ADMIN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const res = NextResponse.next();

  if (isAdminPath(pathname)) {
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons/).*)"],
};
