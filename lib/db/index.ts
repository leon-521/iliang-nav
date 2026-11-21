import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

/**
 * 相对路径会按 process.cwd() 解析。
 * 注意：standalone 模式下 server.js 会 chdir 到 .next/standalone，
 * 所以生产环境务必用绝对路径（容器内为 /app/data/app.db）。
 */
const envPath = process.env.DATABASE_PATH;
const dbPath =
  envPath && path.isAbsolute(envPath)
    ? envPath
    : path.join(process.cwd(), envPath ?? "data/app.db");

function open() {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("synchronous = NORMAL");
  return sqlite;
}

/**
 * 开发环境热重载会重复执行模块，用 globalThis 缓存连接，
 * 否则 SQLite 会被多个连接同时持有。
 */
const globalForDb = globalThis as unknown as { __sqlite?: Database.Database };

export const sqlite = globalForDb.__sqlite ?? open();
if (process.env.NODE_ENV !== "production") globalForDb.__sqlite = sqlite;

export const db = drizzle(sqlite, { schema });
export { schema };
export type DB = typeof db;
