import { NextResponse } from "next/server";

import { COOKIE } from "@/lib/auth/session";

/**
 * 前台退出登录。
 *
 * 为什么不用 Server Action：退出入口就在首页，action 里 redirect("/")
 * 等于重定向到当前地址，不会重新渲染；改成客户端 await 完再硬跳转，
 * 又会在菜单卸载的那一帧抛 React #441（同步输入期间组件挂起）。
 *
 * Route Handler 没有这些问题：直接回两个 Set-Cookie（共享域 + host-only，
 * 同名 cookie 在 ResponseCookies 里会被后者覆盖，所以这里手写原始头）
 * 加一个 302，浏览器拿到就跳，整页重新渲染。
 */
function clearCookieHeaders(): string[] {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const base = `Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure}`;
  const domain = (process.env.COOKIE_DOMAIN ?? "").trim();

  const headers = [`${COOKIE}=; ${base}`];
  if (domain) headers.push(`${COOKIE}=; ${base}; Domain=${domain}`);
  return headers;
}

function handle(req: Request): NextResponse {
  /*
   * 用相对 Location，不要 NextResponse.redirect(new URL("/", req.url))。
   * 反代后面 req.url 是内部地址（http://127.0.0.1:3000/logout），
   * 拼出来的绝对地址浏览器访问不到 —— 表现是跳成 chrome-error 白页。
   *
   * next 只接受站内相对路径，避免被当成开放重定向。
   */
  const next = new URL(req.url).searchParams.get("next");
  const target = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";

  const res = new NextResponse(null, {
    status: 303,
    headers: { location: target },
  });
  for (const value of clearCookieHeaders()) {
    res.headers.append("set-cookie", value);
  }
  return res;
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
