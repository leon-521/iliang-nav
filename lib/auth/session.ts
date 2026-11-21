import { cookies, headers } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

export const COOKIE = "nav_session";
const MAX_AGE = 60 * 60 * 24 * 7;

/**
 * Cookie 作用域。
 *
 * 前后台已经合并到同一个域名，正常情况下不需要设 domain ——
 * 不设时写出来的是 host-only cookie，正好只作用于当前站点。
 *
 * 只有在需要跨子域共享会话时才设 COOKIE_DOMAIN（如 .example.com）。
 * 本地开发不设：127.0.0.1 上写 domain 反而会写不进去。
 */
function cookieDomain(): string | undefined {
  const d = process.env.COOKIE_DOMAIN?.trim();
  return d ? d : undefined;
}

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET 缺失或少于 32 字符");
  return new TextEncoder().encode(s);
}

export async function createSession(userId: string, sessionVersion: number) {
  const jwt = await new SignJWT({ sv: sessionVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());

  const jar = await cookies();
  const domain = cookieDomain();

  /*
   * 切到共享域之前，老用户手上是 host-only 的 nav_session。
   * 同名 cookie 可以并存（host-only 优先），不清掉就会出现
   * 「改了密码/退出登录，后台还登着」的怪现象。
   */
  if (domain) jar.delete({ name: COOKIE, path: "/" });

  jar.set(COOKIE, jwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
    domain,
  });
}

export type Viewer =
  | { kind: "anonymous" }
  | { kind: "admin"; userId: string; email: string };

/**
 * 收集本次请求里所有 nav_session 候选值。
 *
 * 为什么不能只用 cookies().get()：同名 cookie 可以并存
 * （早期 host-only 的一份 + 后来共享域的一份），浏览器会把两条都发上来，
 * 而 cookies() 只返回第一个。如果第一个恰好是改密码前的失效 token，
 * 就会表现为「后台已登录，前台一直未登录」，且刷新多少次都不会好。
 *
 * 这里读原始 Cookie 头拿到全部候选，逐个校验，有一个有效就算登录。
 */
async function sessionCandidates(): Promise<string[]> {
  const raw = (await headers()).get("cookie") ?? "";
  const fromHeader = raw
    .split(";")
    .map((part) => {
      const idx = part.indexOf("=");
      if (idx < 0) return null;
      const name = part.slice(0, idx).trim();
      return name === COOKIE ? part.slice(idx + 1).trim() : null;
    })
    .filter((v): v is string => Boolean(v));

  if (fromHeader.length > 0) return fromHeader;

  // 兜底：某些调用场景（如 Server Action 内部）拿不到原始头
  const one = (await cookies()).get(COOKIE)?.value;
  return one ? [one] : [];
}

/** 校验单个 token，失败返回 null */
async function verifySession(jwt: string): Promise<Viewer | null> {
  try {
    const { payload } = await jwtVerify(jwt, secret(), { algorithms: ["HS256"] });
    const userId = payload.sub;
    if (!userId) return null;

    const row = db
      .select({ id: users.id, email: users.email, sv: users.sessionVersion })
      .from(users)
      .where(eq(users.id, userId))
      .get();

    // 改密码后 sv 变了，旧 token 立即失效
    if (!row || Number(payload.sv) !== row.sv) return null;
    return { kind: "admin", userId: row.id, email: row.email };
  } catch {
    return null;
  }
}

/** 唯一会话解析入口：JWT 有效 + session_version 匹配才算登录 */
export async function getViewer(): Promise<Viewer> {
  const candidates = await sessionCandidates();

  for (const jwt of candidates) {
    const viewer = await verifySession(jwt);
    if (viewer) return viewer;
  }

  return { kind: "anonymous" };
}

export async function requireAdmin(): Promise<
  Extract<Viewer, { kind: "admin" }>
> {
  const viewer = await getViewer();
  if (viewer.kind !== "admin") throw new Error("UNAUTHORIZED");
  return viewer;
}

export async function destroySession() {
  const jar = await cookies();
  const domain = cookieDomain();

  /*
   * 清共享域那份（.example.com）。
   *
   * 注意两点：
   *
   * 1. 不能连着写两次 jar.delete()。Next 的 ResponseCookies 以 cookie 名为键
   *    （见 @edge-runtime/cookies 的 set：map.set(name, …)），同名写两次只会
   *    留下最后一条，结果就是「点了退出登录，刷新还是登录状态」。
   *
   * 2. 也不能用 headers().append() 补发第二条原始 Set-Cookie ——
   *    Server Action 里的 headers() 是只读的，append 会抛
   *    「Headers cannot be modified」，整个 action 直接失败。
   *
   * 所以这里只负责共享域这一份。历史遗留的 host-only cookie 由
   * proxy.ts 的 migrateSessionCookie 在每个后台请求上清掉；
   * 需要一次清干净两个作用域的场合（比如 /logout）走 Route Handler，
   * 那里可以自由 append 原始头。
   */
  jar.set({
    name: COOKIE,
    value: "",
    path: "/",
    maxAge: 0,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    ...(domain ? { domain } : {}),
  });
}
