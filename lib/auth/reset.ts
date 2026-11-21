import crypto from "node:crypto";
import { and, eq, isNull, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { passwordResets, users } from "@/lib/db/schema";

/**
 * 找回密码的令牌。
 *
 * 设计要点：
 *
 * 1. 只存哈希。库文件会进备份、也可能被误传，明文令牌等于把改密码的钥匙
 *    一起存进去了。这里存 sha256(token)，校验时把用户带来的 token 再算一次。
 * 2. 单次使用。用过就写 usedAt，同一个链接第二次点直接失效。
 * 3. 有效期 30 分钟。够点开邮件，又短到即使邮件被转发也不会长期有效。
 * 4. 同一账号只保留最新一条有效令牌。申请第二次时旧的作废 ——
 *    否则用户连点几次「发送」，邮箱里躺着一堆都还能用的链接。
 */

const TTL_SECONDS = 30 * 60;

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** 生成一条新令牌，返回明文（只在这一刻存在，之后库里只有哈希） */
export function issueResetToken(
  userId: string,
  ip?: string | null,
): { token: string; expiresAt: number } {
  const token = crypto.randomBytes(32).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + TTL_SECONDS;

  // 先把该用户还没用掉的旧令牌标记作废
  db.update(passwordResets)
    .set({ usedAt: now })
    .where(and(eq(passwordResets.userId, userId), isNull(passwordResets.usedAt)))
    .run();

  // 顺手清掉过期很久的记录，避免表无限增长
  db.delete(passwordResets)
    .where(lt(passwordResets.expiresAt, now - 7 * 24 * 3600))
    .run();

  db.insert(passwordResets)
    .values({
      id: crypto.randomUUID(),
      userId,
      tokenHash: hashToken(token),
      expiresAt,
      ip: ip ?? null,
    })
    .run();

  return { token, expiresAt };
}

export type ResetTarget = { userId: string; email: string };

/**
 * 校验令牌。
 *
 * 返回 null 的情况一律不区分「不存在 / 过期 / 已用过」——
 * 页面上统一提示「链接已失效，请重新申请」，避免泄露令牌状态。
 */
export function verifyResetToken(token: string): ResetTarget | null {
  const clean = token.trim();
  if (!clean) return null;

  const row = db
    .select({
      userId: passwordResets.userId,
      expiresAt: passwordResets.expiresAt,
      usedAt: passwordResets.usedAt,
      email: users.email,
    })
    .from(passwordResets)
    .innerJoin(users, eq(users.id, passwordResets.userId))
    .where(eq(passwordResets.tokenHash, hashToken(clean)))
    .get();

  if (!row) return null;
  if (row.usedAt) return null;
  if (row.expiresAt < Math.floor(Date.now() / 1000)) return null;

  return { userId: row.userId, email: row.email };
}

/** 用掉令牌（改完密码后调用），保证一条链接只能用一次 */
export function consumeResetToken(token: string) {
  db.update(passwordResets)
    .set({ usedAt: Math.floor(Date.now() / 1000) })
    .where(eq(passwordResets.tokenHash, hashToken(token.trim())))
    .run();
}
