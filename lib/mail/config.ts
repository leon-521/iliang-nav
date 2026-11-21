import { inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";
import { decryptSecret } from "./crypto";

/**
 * 邮件配置读取。
 *
 * 早期版本只读环境变量，改一次配置要登服务器改 .env 再重建容器。
 * 现在改成「后台可配」，优先级：
 *
 *   1. 后台设置页填的值（存在 settings 表）
 *   2. 环境变量（兼容老部署 / 想用密钥管理的情况）
 *
 * 单独拆出来是因为 `lib/auth/reset-actions.ts` 只需要判断「有没有配 SMTP」，
 * 不该为此把 nodemailer 整个拉进页面 bundle。
 */

export type MailConfig = {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
};

const KEYS = ["smtp_host", "smtp_port", "smtp_user", "smtp_pass", "smtp_from"] as const;

type Stored = {
  host: string;
  port: string;
  user: string;
  pass: string;
  from: string;
};

function readStored(): Stored {
  const rows = db
    .select()
    .from(settings)
    .where(inArray(settings.key, [...KEYS]))
    .all();
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    host: map.get("smtp_host")?.trim() ?? "",
    port: map.get("smtp_port")?.trim() ?? "",
    user: map.get("smtp_user")?.trim() ?? "",
    pass: map.get("smtp_pass") ?? "",
    from: map.get("smtp_from")?.trim() ?? "",
  };
}

export function readMailConfig(): MailConfig | null {
  const s = readStored();

  const host = s.host || process.env.SMTP_HOST?.trim() || "";
  const user = s.user || process.env.SMTP_USER?.trim() || "";
  const pass = decryptSecret(s.pass) ?? process.env.SMTP_PASS?.trim() ?? "";

  if (!host || !user || !pass) return null;

  const rawPort = s.port || process.env.SMTP_PORT || "465";
  const port = Number(rawPort);
  if (!Number.isFinite(port) || port <= 0) return null;

  return {
    host,
    port,
    user,
    pass,
    from: s.from || process.env.SMTP_FROM?.trim() || user,
  };
}

/** 页面用它决定要不要显示「邮件服务未配置」 */
export function isMailConfigured(): boolean {
  return readMailConfig() !== null;
}

/**
 * 后台设置页用：返回「有没有填过密码」，但**绝不回传密码本身**。
 *
 * 密码框留空 = 不改（沿用已存的），所以页面只需要知道
 * 「现在库里到底有没有一个能用的密码」，用来决定占位文案。
 */
export function hasStoredPassword(): boolean {
  const s = readStored();
  return Boolean(decryptSecret(s.pass) ?? process.env.SMTP_PASS?.trim());
}

/**
 * 设置页表单的初值：**不含密码**。
 *
 * 直接把 readMailConfig() 传给客户端组件会把授权码打进 RSC payload，
 * 浏览器 devtools 里就能看到。这里只回传「有没有密码」这个布尔。
 */
export type MailDisplay = {
  host: string;
  port: string;
  user: string;
  from: string;
  hasPassword: boolean;
  /** 密码是从环境变量来的，页面上要提示「改了这里会覆盖」 */
  passwordFromEnv: boolean;
};

export function getMailDisplay(): MailDisplay {
  const s = readStored();
  const envPass = Boolean(process.env.SMTP_PASS?.trim());
  return {
    host: s.host || process.env.SMTP_HOST?.trim() || "",
    port: s.port || process.env.SMTP_PORT || "465",
    user: s.user || process.env.SMTP_USER?.trim() || "",
    from: s.from || process.env.SMTP_FROM?.trim() || "",
    hasPassword: Boolean(decryptSecret(s.pass)) || envPass,
    passwordFromEnv: !decryptSecret(s.pass) && envPass,
  };
}
