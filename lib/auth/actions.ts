"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { verify } from "@node-rs/argon2";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { createSession, destroySession } from "./session";

export type LoginState = { error?: string } | null;
/** 弹窗登录：成功返回 ok，由客户端整页刷新（不 redirect，见 loginInlineAction） */
export type LoginInlineState = { error?: string; ok?: boolean } | null;
export type InlineLoginState = { error?: string; ok?: boolean } | null;

/** 单机内存限流：重启即失效，个人站点够用 */
const attempts = new Map<string, { count: number; resetAt: number }>();
const LIMIT = 5;
const WINDOW = 15 * 60 * 1000;
/** 超过这个规模就顺手扫一遍过期键，防止伪造来源把 Map 撑爆 */
const SWEEP_THRESHOLD = 5000;

function sweep(now: number) {
  for (const [k, rec] of attempts) {
    if (now > rec.resetAt) attempts.delete(k);
  }
}

function rateLimit(key: string): boolean {
  const now = Date.now();
  if (attempts.size > SWEEP_THRESHOLD) sweep(now);

  const rec = attempts.get(key);
  if (!rec || now > rec.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW });
    return true;
  }
  if (rec.count >= LIMIT) return false;
  rec.count += 1;
  return true;
}

/**
 * 取客户端地址用于限流。
 *
 * 只信任反代写入的头：nginx 用 `proxy_set_header X-Real-IP $remote_addr;`
 * 覆盖式写入，客户端伪造的同名头会被丢弃。X-Forwarded-For 则是
 * `$proxy_add_x_forwarded_for` 追加语义，最左边那项完全由客户端控制，
 * 拿它当键等于把限流交给攻击者。所以这里优先 X-Real-IP，退而取
 * XFF 的最后一项（可信反代追加的那一段）。
 */
function clientKey(h: Headers): string {
  const real = h.get("x-real-ip")?.trim();
  if (real) return real;

  const xff = h.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
    const last = parts[parts.length - 1];
    if (last) return last;
  }
  return "local";
}

/**
 * 登录后回跳：只接受站内绝对路径，挡掉 `//evil.com` 这类开放重定向。
 */
function safeNext(formData: FormData): string {
  const raw = String(formData.get("next") ?? "");
  return /^\/(?!\/)/.test(raw) ? raw : "/";
}

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const result = await authenticate(formData);
  if (result.error) return { error: result.error };

  /*
   * 登录后回到原来想去的页面。
   *
   * 一键收藏的落地页就靠这个：书签脚本开 /quick-add?url=…&title=…，
   * 没登录会被踢到 /login，登录完必须带着参数回到那一页，
   * 否则用户得重新点一次书签，地址和标题都白带了。
   */
  redirect(safeNext(formData));
}

/**
 * 前台弹窗登录：不 redirect，成功只回 ok。
 *
 * 为什么不用 loginAction：redirect() 会在客户端过渡期卸载整棵弹窗子树，
 * 和退出登录那次踩的是同一个坑（React #441）。
 * 让客户端自己整页刷新，服务端重新渲染出新状态，最稳。
 */
export async function loginInlineAction(
  _prev: LoginInlineState,
  formData: FormData,
): Promise<LoginInlineState> {
  const result = await authenticate(formData);
  if (result.error) return { error: result.error };
  return { ok: true };
}

/** 登录的公共部分：校验 + 建会话。两个入口共用，避免两份限流/校验逻辑走偏 */
async function authenticate(
  formData: FormData,
): Promise<{ error?: string }> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const pw = String(formData.get("password") ?? "");

  if (!email || !pw) return { error: "邮箱和密码都要填" };

  const h = await headers();
  const ip = clientKey(h);

  if (!rateLimit(ip)) return { error: "尝试次数过多，请 15 分钟后再试" };

  const user = db.select().from(users).where(eq(users.email, email)).get();

  // 统一提示，不区分「账号不存在 / 密码错误」
  const ok = user?.passwordHash ? await verify(user.passwordHash, pw) : false;
  if (!user || !ok) return { error: "邮箱或密码不正确" };

  attempts.delete(ip);
  await createSession(user.id, user.sessionVersion);
  return {};
}

/*
 * 退出登录前后台统一走 app/logout/route.ts 的 Route Handler。
 * 不放在 Server Action 里：destroySession 需要一次清掉「共享域」和
 * 「host-only」两种作用域的 cookie，而 Server Action 里 headers() 是只读的，
 * 补发第二条 Set-Cookie 会抛「Headers cannot be modified」，整个 action 失败。
 */
