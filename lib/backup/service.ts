import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { sqlite } from "@/lib/db";

/**
 * 数据备份与恢复。
 *
 * 为什么不用 `cp app.db`：库开着 WAL，直接复制主文件会漏掉 -wal 里
 * 还没 checkpoint 的事务，恢复出来就是「少了最近几条」的库。
 * 必须走 SQLite 的在线备份 API（better-sqlite3 的 .backup()），
 * 它读的是事务一致快照。
 */

const DB_PATH = (() => {
  const envPath = process.env.DATABASE_PATH;
  return envPath && path.isAbsolute(envPath)
    ? envPath
    : path.join(process.cwd(), envPath ?? "data/app.db");
})();

export const BACKUP_DIR = path.join(path.dirname(DB_PATH), "backups");

/** 只接受自己生成的文件名，挡住 ../ 之类的路径穿越 */
const NAME_RE = /^app-\d{8}-\d{6}(?:-[a-z0-9]{1,12})?\.db$/;

export type BackupInfo = {
  name: string;
  size: number;
  createdAt: number;
};

function ensureDir() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function stamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/**
 * 生成一份备份，返回文件名。
 * label 只能是短小写字母数字，用来区分「手动」和「恢复前自动」。
 */
export async function createBackup(label?: string): Promise<string> {
  ensureDir();

  const safeLabel = label?.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12);
  let name = `app-${stamp()}${safeLabel ? `-${safeLabel}` : ""}.db`;
  let dest = path.join(BACKUP_DIR, name);

  // 同一秒内连点两次会撞名，加序号
  let i = 2;
  while (fs.existsSync(dest)) {
    name = `app-${stamp()}-${safeLabel ?? "b"}${i}.db`;
    dest = path.join(BACKUP_DIR, name);
    i++;
  }

  await sqlite.backup(dest);
  return name;
}

export function listBackups(): BackupInfo[] {
  ensureDir();
  return fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => NAME_RE.test(f))
    .map((name) => {
      const st = fs.statSync(path.join(BACKUP_DIR, name));
      return { name, size: st.size, createdAt: Math.floor(st.mtimeMs / 1000) };
    })
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function backupPath(name: string): string {
  if (!NAME_RE.test(name)) throw new Error("备份文件名不合法");
  const p = path.join(BACKUP_DIR, name);
  if (!fs.existsSync(p)) throw new Error("备份不存在");
  return p;
}

export function deleteBackup(name: string): void {
  fs.rmSync(backupPath(name));
}

/**
 * 恢复。
 *
 * 做法是把备份文件当作「源连接」，用在线备份 API 反向写回主库，
 * 这样不用停容器、不用重启。schema 不变的前提下应用连接照常可用。
 *
 * 恢复前强制先备份当前状态 —— 恢复错了还能退回来。
 */
export async function restoreBackup(name: string): Promise<{ safety: string }> {
  const src = backupPath(name);

  // 先验一下文件是不是真的 SQLite，别把垃圾写进主库
  let probe: Database.Database;
  try {
    probe = new Database(src, { readonly: true });
  } catch {
    throw new Error("备份文件无法打开，已中止恢复");
  }

  try {
    let integrityOk = false;
    try {
      const row = probe.prepare("PRAGMA integrity_check").get() as
        | { integrity_check: string }
        | undefined;
      integrityOk = row?.integrity_check === "ok";
    } catch {
      // better-sqlite3 对非数据库文件抛的是英文 "file is not a database"
      throw new Error("备份文件损坏或不是有效的数据库，已中止恢复");
    }
    if (!integrityOk) throw new Error("备份文件损坏，已中止恢复");

    const hasTable = probe
      .prepare("select name from sqlite_master where type='table' and name='bookmarks'")
      .get();
    if (!hasTable) throw new Error("备份文件里没有 bookmarks 表，不像本系统的备份");
  } finally {
    probe.close();
  }

  const safety = await createBackup("prerestore");

  // 反向备份：备份文件 → 主库
  const source = new Database(src, { readonly: true });
  try {
    await source.backup(DB_PATH);
  } finally {
    source.close();
  }

  // 让主连接看到新内容并落盘
  sqlite.pragma("wal_checkpoint(TRUNCATE)");

  return { safety };
}

/** 人类可读大小 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
