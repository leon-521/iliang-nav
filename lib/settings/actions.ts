"use server";

import { parseWeatherLocation } from "@/lib/weather";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { hash, verify } from "@node-rs/argon2";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { destroySession } from "@/lib/auth/session";
import { isValidNewPassword, NEW_PASSWORD_HINT } from "@/lib/auth/password-policy";
import { getSettings, setSetting } from "./service";
import { saveMailConfig } from "@/lib/mail/store";
import { readMailConfig } from "@/lib/mail/config";
import { z } from "zod";
import { listVisibleBookmarks, pickQuickTools } from "@/lib/public/service";
import { sendMail } from "@/lib/mail";

export type SettingsState = { ok?: boolean; error?: string } | null;

const ARGON = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

export async function saveSettings(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  await requireAdmin();

  const siteName = String(formData.get("siteName") ?? "").trim();
  const siteTagline = String(formData.get("siteTagline") ?? "").trim();
  const footerText = formData.get("footerText");
  const footer = typeof footerText === "string" ? footerText.trim() : undefined;
  const weatherSubmitted = formData.has("weatherName");
  const weatherName = String(formData.get("weatherName") ?? "").trim();
  const weather = parseWeatherLocation(weatherName, String(formData.get("weatherLatitude") ?? "").trim(), String(formData.get("weatherLongitude") ?? "").trim());
  if (weatherSubmitted && weatherName && !weather) return { error: "天气地点最多 40 字，并需填写有效纬度（-90 至 90）和经度（-180 至 180）。" };
  const ownerName = String(formData.get("ownerName") ?? "").trim();
  const showIcons = formData.get("showIcons") === "on";
  const quickToolIds = String(formData.get("quickToolIds") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!siteName) return { error: "站点名称不能为空" };
  if (siteName.length > 40) return { error: "站点名称最多 40 字" };
  if (siteTagline.length > 80) return { error: "副标题最多 80 字" };
  if (footer && footer.length > 160) return { error: "页脚文字最多 160 字" };
  if (ownerName.length > 20) return { error: "称呼最多 20 字" };
  if (quickToolIds.length > 12) return { error: "常用工具最多 12 个" };

  setSetting("site_name", siteName);
  setSetting("site_tagline", siteTagline);
  if (footer !== undefined) setSetting("footer_text", footer);
  setSetting("owner_name", ownerName);
  if (weatherSubmitted) {
    setSetting("weather_name", weather?.name ?? "");
    setSetting("weather_latitude", weather ? String(weather.latitude) : "");
    setSetting("weather_longitude", weather ? String(weather.longitude) : "");
  }
  setSetting("show_icons", showIcons ? "1" : "0");
  const existing = getSettings();
  setSetting("quick_tool_ids", quickToolIds.join(",") || (existing.quickToolsManual && !existing.quickToolIds.length ? "[]" : ""));

  revalidatePath("/");
  revalidatePath("/settings");
  return { ok: true };
}

/**
 * 只改「常用工具」这一项。
 *
 * 前台弹窗复用它，而不是把整张设置表单塞进对话框：
 * saveSettings 会读 siteName/siteTagline 等字段，前台弹窗没有这些输入，
 * 传进去就是空字符串，直接把站点名称清掉。只写自己负责的那一个 key 最安全。
 */
export async function saveQuickTools(
  ids: string[],
): Promise<SettingsState> {
  await requireAdmin();

  const clean = ids
    .map((s) => String(s).trim())
    .filter(Boolean)
    .slice(0, 12);

  setSetting("quick_tool_ids", clean.join(","));
  revalidatePath("/");
  revalidatePath("/settings");
  return { ok: true };
}

const shortcutId = z.string().uuid();
const shortcutMutation = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("add"), id: shortcutId }),
  z.object({ kind: z.literal("remove"), id: shortcutId }),
  z.object({ kind: z.literal("move"), id: shortcutId, target: shortcutId }),
]);

/** Read the current list at mutation time so untouched/hidden slots remain intact. */
export async function changeQuickTool(input: unknown): Promise<SettingsState> {
  const admin = await requireAdmin();
  const parsed = shortcutMutation.safeParse(input);
  if (!parsed.success) return { error: "常用入口操作无效。" };
  const action = parsed.data;
  const result = db.transaction(() => {
    const current = getSettings();
    const items = listVisibleBookmarks(admin);
    const visible = [...new Set(pickQuickTools(items, current.quickToolIds, current.quickToolsManual).map(({ id }) => id))];
    let ids = [...new Set(current.quickToolsManual ? current.quickToolIds : visible)];
    if (action.kind === "add") {
      if (!items.some(({ id }) => id === action.id)) return { error: "书签已不存在。" };
      if (ids.includes(action.id)) return { ok: true };
      if (ids.length >= 12) return { error: "常用入口最多 12 个。" };
      ids.push(action.id);
    } else if (action.kind === "remove") {
      if (!ids.includes(action.id)) return { ok: true };
      ids = ids.filter((id) => id !== action.id);
    } else {
      const from = visible.indexOf(action.id), to = visible.indexOf(action.target);
      if (from < 0 || to < 0) return { error: "常用入口已变化，请重试。" };
      if (from === to) return { ok: true };
      const visibleSet = new Set(visible);
      visible.splice(from, 1);
      visible.splice(to, 0, action.id);
      let cursor = 0;
      ids = ids.map((id) => visibleSet.has(id) ? visible[cursor++] : id);
    }
    setSetting("quick_tool_ids", ids.join(",") || "[]");
    return { ok: true };
  });
  if (result.ok) { revalidatePath("/"); revalidatePath("/settings"); }
  return result;
}

export async function changePassword(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const viewer = await requireAdmin();

  const current = String(formData.get("currentPassword") ?? "");
  const next = String(formData.get("newPassword") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  if (!isValidNewPassword(next)) return { error: `新${NEW_PASSWORD_HINT}` };
  if (next !== confirm) return { error: "两次输入的新密码不一致" };
  if (next === current) return { error: "新密码不能和当前密码相同" };

  const user = db.select().from(users).where(eq(users.id, viewer.userId)).get();
  if (!user || !user.passwordHash) return { error: "账号不存在" };

  const valid = await verify(user.passwordHash, current);
  if (!valid) return { error: "当前密码不正确" };

  const passwordHash = await hash(next, ARGON);

  // session_version +1：其它设备上的旧会话立即失效
  db.update(users)
    .set({
      passwordHash,
      sessionVersion: sql`${users.sessionVersion} + 1`,
    })
    .where(eq(users.id, viewer.userId))
    .run();

  await destroySession();
  revalidatePath("/");
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* 邮件服务                                                            */
/* ------------------------------------------------------------------ */

/**
 * 保存 SMTP 配置 + 邮件模板。
 *
 * 密码框留空 = 不改。页面上永远不回显密码，用户没法把已存的值再提交一遍，
 * 所以空值必须理解成保持不变，而不是清空 —— 否则用户改一下端口号，
 * 密码就被顺手抹了，而且他完全看不出来。
 */
export async function saveMailSettings(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  await requireAdmin();

  const host = String(formData.get("smtpHost") ?? "").trim();
  const port = String(formData.get("smtpPort") ?? "").trim();
  const user = String(formData.get("smtpUser") ?? "").trim();
  const pass = String(formData.get("smtpPass") ?? "");
  const from = String(formData.get("smtpFrom") ?? "").trim();
  const subject = String(formData.get("mailSubject") ?? "").trim();
  const text = String(formData.get("mailText") ?? "");
  const html = String(formData.get("mailHtml") ?? "");

  // 要么全空（关掉邮件功能），要么 host/user 齐全 —— 半截配置只会让发信失败
  const anyFilled = Boolean(host || user || pass || from);
  if (anyFilled) {
    if (!host) return { error: "请填写 SMTP 服务器地址" };
    if (!user) return { error: "请填写 SMTP 登录账号" };
    if (host.includes("://")) {
      return { error: "SMTP 服务器只填主机名，不要带 smtp:// 或 https://" };
    }
    if (port) {
      const n = Number(port);
      if (!Number.isInteger(n) || n <= 0 || n > 65535) {
        return { error: "端口必须是 1-65535 的整数" };
      }
    }
  }

  if (subject.length > 120) return { error: "邮件主题最多 120 字" };
  if (text.length > 5000) return { error: "纯文本正文最多 5000 字" };
  if (html.length > 20000) return { error: "HTML 正文最多 20000 字" };

  saveMailConfig({ host, port: port || "465", user, pass, from });

  setSetting("mail_subject", subject);
  setSetting("mail_text", text);
  setSetting("mail_html", html);

  revalidatePath("/settings");
  return { ok: true };
}

/**
 * 发一封测试邮件。
 *
 * 存在的意义：SMTP 配错时错误只进日志（页面上不回显服务器细节），
 * 没有这个按钮的话，用户只能去「忘记密码」试 —— 那条路还要走限流、
 * 还会真的消耗一个重置令牌。这里直接连一次，成不成立刻知道。
 *
 * 失败时返回的错误是「人能看懂 + 能照着修」的，但仍不包含密码。
 */
export async function sendTestMail(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  await requireAdmin();

  const to = String(formData.get("testTo") ?? "").trim();
  if (!to) return { error: "请填写收件邮箱" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return { error: "收件邮箱格式不对" };
  }

  const cfg = readMailConfig();
  if (!cfg) {
    return { error: "配置不完整：服务器地址、账号、密码都要填，然后先保存再测试" };
  }

  const siteName = getSettings().siteName;

  const result = await sendMail({
    to,
    subject: `[测试] ${siteName} 邮件配置正常`,
    text: [
      "这是一封测试邮件。",
      "",
      `如果你收到它，说明 ${siteName} 的 SMTP 配置可以正常发信，`,
      "「忘记密码」功能现在也能用了。",
      "",
      `发件人：${cfg.from}`,
      `服务器：${cfg.host}:${cfg.port}`,
    ].join("\n"),
  });

  if (!result.ok) return { error: result.error };
  return { ok: true };
}
