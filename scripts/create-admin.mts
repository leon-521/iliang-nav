import Database from "better-sqlite3";
import { hash } from "@node-rs/argon2";
import { randomUUID } from "node:crypto";
import readline from "node:readline";
import path from "node:path";
import fs from "node:fs";

const dbPath =
  process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "app.db");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma("foreign_keys = ON");

/** 从 argv / env 读参数，缺的走交互式提问 */
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

/** 一次性把 stdin 读成行队列，避免多行管道输入被第一个 question 吞掉 */
function makeReader() {
  const lines: string[] = [];
  let closed = false;
  const rl = readline.createInterface({ input: process.stdin });

  const ready = new Promise<void>((resolve) => {
    rl.on("line", (l) => lines.push(l));
    rl.on("close", () => {
      closed = true;
      resolve();
    });
    // 管道输入读完就 close；TTY 交互时不会 close
    if (!process.stdin.isTTY) {
      process.stdin.on("end", () => {
        closed = true;
        resolve();
      });
    }
  });

  return {
    ready,
    async ask(prompt: string): Promise<string> {
      if (lines.length > 0) {
        const v = lines.shift()!;
        process.stdout.write(`${prompt}${"*".repeat(Math.min(v.length, 12))}\n`);
        return v;
      }
      if (closed) return "";
      return new Promise((resolve) => rl.question(prompt, resolve));
    },
    close() {
      rl.close();
    },
  };
}

const reader = makeReader();

const existing = db.prepare("select id, email from users limit 1").get() as
  | { id: string; email: string }
  | undefined;

const email =
  (arg("email") ?? process.env.ADMIN_EMAIL ?? (await reader.ask(
    `邮箱${existing ? ` [${existing.email}]` : ""}: `,
  ))).trim() || existing?.email;

if (!email) {
  console.error("邮箱必填");
  process.exit(1);
}

const pw =
  arg("password") ??
  process.env.ADMIN_PASSWORD ??
  (await reader.ask("密码（6–12 个字符）: "));

// Keep the Unicode code-point count consistent with the web forms.
if (!pw || !/^[\s\S]{6,12}(?![\s\S])/u.test(pw)) {
  console.error("密码须为 6–12 个字符");
  process.exit(1);
}

if (!arg("password") && !process.env.ADMIN_PASSWORD) {
  const pw2 = await reader.ask("再输一次: ");
  if (pw !== pw2) {
    console.error("两次不一致");
    process.exit(1);
  }
}
reader.close();

const pwHash = await hash(pw, {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
});

if (existing) {
  db.prepare(
    "update users set email = ?, password_hash = ?, session_version = session_version + 1 where id = ?",
  ).run(email, pwHash, existing.id);
  console.log(`✅ 已更新账号 ${email}（旧会话全部失效）`);
} else {
  db.prepare(
    "insert into users (id, email, password_hash, name, session_version) values (?, ?, ?, ?, 0)",
  ).run(randomUUID(), email, pwHash, "管理员");
  console.log(`✅ 已创建账号 ${email}`);
}

db.close();
