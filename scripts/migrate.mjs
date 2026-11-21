/**
 * 迁移执行器（不依赖 drizzle-orm 运行时）
 *
 * standalone 打包会把 drizzle-orm 内联进 server bundle，
 * 镜像里没有这个包，所以这里直接用 better-sqlite3 执行 drizzle 生成的 .sql。
 */
import Database from "better-sqlite3";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const dbPath =
  process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "app.db");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS __drizzle_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hash TEXT NOT NULL,
    created_at NUMERIC
  );
`);

const applied = new Set(
  sqlite
    .prepare("SELECT hash FROM __drizzle_migrations")
    .all()
    .map((r) => r.hash),
);

const dir = path.join(process.cwd(), "drizzle");
const files = fs.existsSync(dir)
  ? fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort()
  : [];

let count = 0;
for (const file of files) {
  const sql = fs.readFileSync(path.join(dir, file), "utf8");
  // drizzle-kit 记的是文件内容的 sha256，不是文件名，两边必须一致才不会重复执行
  const hash = crypto.createHash("sha256").update(sql).digest("hex");
  if (applied.has(hash)) continue;

  const legacyName = file.replace(/\.sql$/, "");
  if (applied.has(legacyName)) continue;

  const statements = sql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);

  sqlite.transaction(() => {
    for (const stmt of statements) sqlite.exec(stmt);
    sqlite
      .prepare(
        "INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)",
      )
      .run(hash, Date.now());
  })();

  console.log(`applied ${file}`);
  count++;
}

console.log(`schema migrations: ${count} applied, ${files.length - count} skipped`);

// FTS5 索引 + 触发器（幂等，每次启动重建索引内容）
const ftsFile = path.join(process.cwd(), "scripts", "fts.sql");
if (fs.existsSync(ftsFile)) {
  sqlite.exec(fs.readFileSync(ftsFile, "utf8"));
  const n = sqlite.prepare("SELECT count(*) c FROM bookmarks_fts").get();
  console.log(`fts index rebuilt (${n.c} rows)`);
}

sqlite.close();
