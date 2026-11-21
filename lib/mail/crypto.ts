import crypto from "node:crypto";

/**
 * SMTP 密码（授权码）的落库加密。
 *
 * 为什么要加密：配置从 .env 搬到数据库后，密码就跟着 app.db 一起进备份、
 * 也可能被误传/误贴。明文躺在一张 settings 表里，等于把邮箱授权码公开。
 *
 * 用什么：AES-256-GCM，密钥从 AUTH_SECRET 派生（站点已经在用它签会话，
 * 不会引入新的必填变量）。GCM 自带认证标签，密文被篡改会直接解密失败，
 * 而不是解出一段乱码再去连 SMTP。
 *
 * 代价：换 AUTH_SECRET 会导致已存密码解不开 —— 这是可接受的，
 * 换 AUTH_SECRET 本来就会让所有会话失效，重新填一次授权码很合理。
 */

const PREFIX = "enc:v1:";

function key(): Buffer {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) {
    throw new Error("AUTH_SECRET 缺失或少于 32 字符，无法加解密邮件密码");
  }
  // 加盐区分用途：同一个 AUTH_SECRET 在别处派生出的密钥不能通用
  return crypto.createHash("sha256").update(`${s}:mail-credential`).digest();
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return (
    PREFIX +
    [iv.toString("base64url"), tag.toString("base64url"), body.toString("base64url")].join(":")
  );
}

/** 解不开就返回 null，调用方按「没配密码」处理，不要让页面崩掉 */
export function decryptSecret(stored: string | undefined | null): string | null {
  if (!stored || !stored.startsWith(PREFIX)) return null;
  const parts = stored.slice(PREFIX.length).split(":");
  if (parts.length !== 3) return null;

  try {
    const [ivB, tagB, bodyB] = parts;
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      key(),
      Buffer.from(ivB, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tagB, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(bodyB, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}
