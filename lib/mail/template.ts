import { getSettings } from "@/lib/settings/service";

/**
 * 重置密码邮件的模板。
 *
 * 为什么让用户自己改：不同人发信的场景不一样 —— 有人想让邮件看起来像
 * 站点自己的品牌，有人只想改个称呼。写死在代码里每次都要发版。
 *
 * 占位符用 {{name}}，只在发送时替换，不做表达式求值 ——
 * 模板来自后台表单，任何"能执行"的设计都是自找麻烦。
 */

export type TemplateVars = {
  siteName: string;
  link: string;
  email: string;
  ttlMinutes: number;
};

export const DEFAULT_SUBJECT = "重置 {{siteName}} 的登录密码";

export const DEFAULT_TEXT = `有人（大概是你）申请重置 {{siteName}} 管理员账号（{{email}}）的密码。

点下面的链接设置新密码，{{ttlMinutes}} 分钟内有效，且只能用一次：
{{link}}

如果这不是你本人操作，忽略这封邮件即可，现有密码不受影响。`;

export const DEFAULT_HTML = `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a202b">
  <h2 style="margin:0 0 12px;font-size:18px">重置登录密码</h2>
  <p style="margin:0 0 16px;font-size:14px;line-height:1.7;color:#4a5260">
    有人（大概是你）申请重置 {{siteName}} 管理员账号的密码。
    点下面的按钮设置新密码，<strong>{{ttlMinutes}} 分钟内有效</strong>，且只能用一次。
  </p>
  <p style="margin:0 0 20px">
    <a href="{{link}}"
       style="display:inline-block;background:#2f7d4f;color:#fff;text-decoration:none;padding:11px 20px;border-radius:9px;font-size:14px;font-weight:500">
      设置新密码
    </a>
  </p>
  <p style="margin:0 0 8px;font-size:12px;line-height:1.7;color:#6b7280">
    按钮点不开就把这个地址复制到浏览器：
  </p>
  <p style="margin:0 0 20px;font-size:12px;word-break:break-all;color:#2f7d4f">{{link}}</p>
  <p style="margin:0;font-size:12px;line-height:1.7;color:#6b7280">
    如果这不是你本人操作，忽略这封邮件即可，现有密码不受影响。
  </p>
</div>`;

/** 模板里能用的占位符，设置页直接拿它渲染说明，避免文档和实现走偏 */
export const TEMPLATE_VARS = [
  { name: "siteName", desc: "站点名称" },
  { name: "link", desc: "重置链接（含 token，30 分钟有效）" },
  { name: "email", desc: "收件人邮箱" },
  { name: "ttlMinutes", desc: "有效期分钟数" },
] as const;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * 替换占位符。
 *
 * 未知的 {{xxx}} 原样保留 —— 用户拼错变量名时，邮件里能一眼看出来
 * 是模板问题，而不是静默变成空白让人以为链接丢了。
 */
export function render(tpl: string, vars: TemplateVars, opts?: { html?: boolean }): string {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (whole, name: string) => {
    const key = name as keyof TemplateVars;
    if (!(key in vars)) return whole;
    const value = String(vars[key]);
    // HTML 版要把用户可控内容转义；link 是站内生成的，仍按普通文本处理
    return opts?.html ? escapeHtml(value) : value;
  });
}

/**
 * 链接在 HTML 里要放进 href，转义后 & 会变成 &amp;，浏览器解析 href 时
 * 会还原，这是正确的；但如果用户把 {{link}} 写在纯文本段落里，
 * 转义后的 &amp; 会原样显示。所以 href 位置单独用一个不转义的变量。
 */
export function renderHtml(tpl: string, vars: TemplateVars): string {
  const withRawLink = tpl.replace(/\{\{\s*link\s*\}\}/g, "\u0000LINK\u0000");
  const escaped = render(withRawLink, vars, { html: true });
  return escaped.split("\u0000LINK\u0000").join(escapeHtml(vars.link));
}

export type MailTemplate = { subject: string; text: string; html: string };

/** 后台没配过就用默认模板，保证功能可用 */
export function getMailTemplate(): MailTemplate {
  const s = getSettings();
  return {
    subject: s.mailSubject?.trim() || DEFAULT_SUBJECT,
    text: s.mailText?.trim() || DEFAULT_TEXT,
    html: s.mailHtml?.trim() || DEFAULT_HTML,
  };
}

export function buildResetMail(vars: TemplateVars): {
  subject: string;
  text: string;
  html: string;
} {
  const t = getMailTemplate();
  return {
    subject: render(t.subject, vars).replace(/[\r\n]+/g, " "),
    text: render(t.text, vars),
    html: renderHtml(t.html, vars),
  };
}
