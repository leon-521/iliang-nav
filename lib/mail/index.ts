import nodemailer, { type Transporter } from "nodemailer";
import { readMailConfig, type MailConfig } from "./config";

export { isMailConfigured, readMailConfig } from "./config";

/**
 * 发信。
 *
 * 站点是单用户自部署，没有第三方邮件服务依赖，直接用 SMTP。
 * 配置全走环境变量，缺一个就视为「没配」—— 与其发出半截邮件，
 * 不如让页面明确告诉用户「邮件服务未配置」，并指向服务器上的重置脚本。
 */

/*
 * transporter 缓存。
 *
 * 配置以前只来自环境变量，进程内不会变，所以缓存一个就够。
 * 现在配置能在后台改，缓存必须带 key —— 否则用户改完服务器地址
 * 点「测试发信」，连的还是旧主机，看到的成功/失败都不作数。
 * 连接池本身是珍贵的（每次新建都要重新 TLS 握手 + 认证），
 * 所以不是每次发信都重建，只在配置变了的时候重建。
 */
let cached: { key: string; transport: Transporter } | null = null;

function transport(cfg: MailConfig): Transporter {
  // 密码不进 key 的明文，但长度和首尾字符足够区分「改过密码」
  const key = [
    cfg.host,
    cfg.port,
    cfg.user,
    cfg.from,
    cfg.pass.length,
    cfg.pass.slice(0, 2),
    cfg.pass.slice(-2),
  ].join("|");

  if (cached?.key === key) return cached.transport;

  // 旧连接可能还占着 socket，先关掉再建新的
  cached?.transport.close();

  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    // 465 是隐式 TLS，587 走 STARTTLS。按端口判断，不额外加配置项。
    secure: cfg.port === 465,
    auth: { user: cfg.user, pass: cfg.pass },
    // 国内服务器连海外 SMTP 偶尔很慢，给足超时但别无限等
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });

  cached = { key, transport };
  return transport;
}

export type SendResult = { ok: true } | { ok: false; error: string };

export async function sendMail(opts: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<SendResult> {
  const cfg = readMailConfig();
  if (!cfg) return { ok: false, error: "邮件服务未配置" };

  try {
    await transport(cfg).sendMail({
      from: cfg.from,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
    });
    return { ok: true };
  } catch (err) {
    /*
     * 不要把 SMTP 的原始错误抛到页面上：里面有服务器地址、账号名，
     * 甚至可能有认证细节。日志里留全量，页面上只给一句人话。
     */
    console.error("[mail] send failed:", err);
    return { ok: false, error: "邮件发送失败，请稍后再试或联系站点管理员" };
  }
}
