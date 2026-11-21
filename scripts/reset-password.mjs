/**
 * 应急重置管理员密码（服务器端，不依赖邮件）。
 *
 * 用途：忘了密码、邮件又发不出去（SMTP 没配 / 收不到信）时的最后手段。
 * 需要能登服务器，所以它本身就是一道很强的权限边界。
 *
 * 用法（容器内，镜像里没有 tsx，所以这里用纯 JS）：
 *   docker compose exec iliang-nav node scripts/reset-password.mjs
 *   docker compose exec iliang-nav node scripts/reset-password.mjs --password 'xxxxxxxxxxxx'
 *
 * 做三件事：
 *  1. 换密码（argon2id，参数与后台改密码一致）；
 *  2. session_version + 1，所有已登录设备立即掉线；
 *  3. 清掉该用户未使用的重置令牌，避免旧邮件里的链接还能用。
 */
import Database from "better-sqlite3";
import { hash } from "@node-rs/argon2";
import readline from "node:readline";
import path from "node:path";

const dbPath =
  process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "app.db");

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

/** 读一行但不回显（密码不该留在终端里） */
function askHidden(prompt) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });

    // _writeToOutput 是 readline 内部方法，官方没导出，但这是隐藏输入的标准做法
    rl._writeToOutput = (s) => {
      if (s.includes(prompt)) process.stdout.write(s);
    };

    rl.question(prompt, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

const user = db.prepare("select id, email from users limit 1").get();

if (!user) {
  console.error("数据库里没有用户，先跑 create-admin");
  process.exit(1);
}

let pw = arg("password") ?? process.env.ADMIN_PASSWORD;

if (pw === undefined) {
  console.log(`账号：${user.email}`);
  pw = await askHidden("新密码（6–12 个字符）: ");
  const again = await askHidden("再输一次: ");
  if (pw !== again) {
    console.error("两次输入不一致");
    process.exit(1);
  }
}

// Keep the Unicode code-point count consistent with the web forms.
if (!pw || !/^[\s\S]{6,12}(?![\s\S])/u.test(pw)) {
  console.error("密码须为 6–12 个字符");
  process.exit(1);
}

const pwHash = await hash(pw, {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
});

db.prepare(
  "update users set password_hash = ?, session_version = session_version + 1 where id = ?",
).run(pwHash, user.id);

// 未使用的重置令牌一并作废：邮箱里那封旧邮件不该还能改密码
try {
  db.prepare(
    "update password_resets set used_at = unixepoch() where user_id = ? and used_at is null",
  ).run(user.id);
} catch {
  // 老库还没跑过 password_resets 迁移时忽略
}

console.log(`✅ 已重置 ${user.email} 的密码，所有已登录设备立即失效`);
db.close();
