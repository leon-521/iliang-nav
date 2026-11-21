"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { hash } from "@node-rs/argon2";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { isMailConfigured, sendMail } from "@/lib/mail";
import { buildResetMail } from "@/lib/mail/template";
import { getSettings } from "@/lib/settings/service";
import { consumeResetToken, issueResetToken, verifyResetToken } from "./reset";
import { destroySession } from "./session";
import { isValidNewPassword, NEW_PASSWORD_HINT } from "./password-policy";

export type ResetState = {
  ok?: boolean;
  error?: string;
  /** 发信成功后的提示文案（不暴露邮箱是否存在） */
  message?: string;
} | null;

const ARGON = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

/**
 * 申请重置的限流：同一 IP 15 分钟内最多 3 次。
 *
 * 比登录限流更严，因为这里每成功一次就会发一封邮件 ——
 * 不限制的话，一个脚本能把站点的发信额度刷爆、把域名打进黑名单。
 */
const requests = new Map<string, { count: number; resetAt: number }>();
const REQ_LIMIT = 3;
const REQ_WINDOW = 15 * 60 * 1000;
const SWEEP_THRESHOLD = 5000;

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

function allow(key: string): boolean {
  const now = Date.now();
  if (requests.size > SWEEP_THRESHOLD) {
    for (const [k, rec] of requests) {
      if (now > rec.resetAt) requests.delete(k);
    }
  }

  const rec = requests.get(key);
  if (!rec || now > rec.resetAt) {
    requests.set(key, { count: 1, resetAt: now + REQ_WINDOW });
    return true;
  }
  if (rec.count >= REQ_LIMIT) return false;
  rec.count += 1;
  return true;
}

function baseUrl(): string {
  const raw = process.env.PUBLIC_BASE_URL?.trim();
  return raw ? raw.replace(/\/$/, "") : "";
}

/**
 * 第一步：提交邮箱，发一封带重置链接的信。
 *
 * 无论邮箱是否存在都返回同一句提示。单用户站点虽然不容易被枚举，
 * 但把「这个邮箱存在」当免费情报送给扫描器没有意义。
 */
export async function requestResetAction(
  _prev: ResetState,
  formData: FormData,
): Promise<ResetState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) return { error: "请填写邮箱" };

  const h = await headers();
  const ip = clientKey(h);
  if (!allow(ip)) return { error: "申请太频繁，请 15 分钟后再试" };

  if (!isMailConfigured()) {
    return {
      error:
        "站点还没有配置发信服务（SMTP），暂时发不出重置邮件。请让管理员登录后台在「设置 → 邮件服务」里填写 SMTP，或直接在服务器上运行 reset-password 脚本。",
    };
  }

  const user = db.select().from(users).where(eq(users.email, email)).get();

  if (user) {
    const { token } = issueResetToken(user.id, ip);
    const link = `${baseUrl()}/reset-password?token=${encodeURIComponent(token)}`;

    // 模板由后台配置，留空时 buildResetMail 会退回内置默认
    const mail = buildResetMail({
      siteName: getSettings().siteName,
      link,
      email: user.email,
      ttlMinutes: 30,
    });

    const result = await sendMail({
      to: user.email,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });

    // 发信失败要如实告诉用户，否则他会一直等一封永远不来的邮件
    if (!result.ok) {
      return {
        error: `${result.error}。管理员可以到「设置 → 邮件服务」用测试发信排查，或在服务器上运行 reset-password 脚本。`,
      };
    }
  }

  return {
    ok: true,
    message:
      "如果这个邮箱对应管理员账号，重置邮件已经发出。请查收，也看一下垃圾箱。",
  };
}

/**
 * 第二步：带 token 设置新密码。
 *
 * 改完 session_version +1：所有设备上的旧会话立即失效，
 * 顺手清掉当前浏览器的 cookie，避免停在半登录状态。
 */
export async function resetPasswordAction(
  _prev: ResetState,
  formData: FormData,
): Promise<ResetState> {
  const token = String(formData.get("token") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!token) return { error: "链接无效，请重新申请" };
  if (!isValidNewPassword(password)) return { error: `新${NEW_PASSWORD_HINT}` };
  if (password !== confirm) return { error: "两次输入的新密码不一致" };

  const target = verifyResetToken(token);
  if (!target) {
    return { error: "链接已失效或已被使用，请重新申请一封" };
  }

  const passwordHash = await hash(password, ARGON);

  db.update(users)
    .set({
      passwordHash,
      sessionVersion: sql`${users.sessionVersion} + 1`,
    })
    .where(eq(users.id, target.userId))
    .run();

  consumeResetToken(token);
  await destroySession();

  /*
   * 必须直接跳走，不能 return ok 让页面自己跳。
   *
   * action 返回后 Next 会重新渲染当前路由；此时 token 已被消费，
   * 服务端校验必然失败，页面会瞬间翻成「链接已失效」，
   * 客户端 effect 还没跑就被卸载了。redirect 由框架接管，
   * 一步到位到登录页，成功提示在那里展示。
   */
  redirect("/login?reset=1");
}
