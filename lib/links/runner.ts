import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookmarks } from "@/lib/db/schema";
import { checkUrl, type CheckResult } from "./check";

/**
 * 批量检测。给「手动点一下」和「定时任务」共用。
 *
 * 排序按 last_checked_at 升序（从没查过的排最前），
 * 这样每次跑一轮都会把最久没检查的往前推，不会永远只查前 N 条。
 */

export type CheckSummary = {
  total: number;
  checked: number;
  broken: number;
  recovered: number;
  /** 无法判定（内网地址等），不算失效 */
  skipped: number;
  durationMs: number;
};

/** 同一个进程里只允许跑一轮，避免手动触发和定时任务撞车 */
let running: Promise<CheckSummary> | null = null;

export function isCheckRunning() {
  return running !== null;
}

export async function runLinkCheck(
  opts: { limit?: number; concurrency?: number } = {},
): Promise<CheckSummary> {
  if (running) return running;

  running = doRun(opts).finally(() => {
    running = null;
  });
  return running;
}

async function doRun(opts: { limit?: number; concurrency?: number }): Promise<CheckSummary> {
  const started = Date.now();
  const limit = Math.min(Math.max(opts.limit ?? 300, 1), 2000);
  const concurrency = Math.min(Math.max(opts.concurrency ?? 5, 1), 16);

  const rows = db
    .select({ id: bookmarks.id, url: bookmarks.url, isBroken: bookmarks.isBroken })
    .from(bookmarks)
    .orderBy(sql`${bookmarks.lastCheckedAt} is not null`, bookmarks.lastCheckedAt)
    .limit(limit)
    .all();

  const summary: CheckSummary = {
    total: rows.length,
    checked: 0,
    broken: 0,
    recovered: 0,
    skipped: 0,
    durationMs: 0,
  };

  if (rows.length === 0) {
    summary.durationMs = Date.now() - started;
    return summary;
  }

  const now = () => Math.floor(Date.now() / 1000);

  let cursor = 0;
  async function worker() {
    while (cursor < rows.length) {
      const row = rows[cursor++];
      let result: CheckResult;
      try {
        result = await checkUrl(row.url);
      } catch {
        result = {
          ok: true,
          status: null,
          reason: "blocked",
          detail: "检测异常，跳过",
          finalUrl: null,
        };
      }

      /*
       * 无法判定的不动 is_broken，只记时间。
       * unreachable 也要跳过：这台机器连不上 ≠ 链接坏了，
       * 若强行写 is_broken=false 会把之前确认失效的链接误判成「已恢复」。
       */
      if (result.reason === "blocked" || result.reason === "unreachable") {
        db.update(bookmarks)
          .set({ lastCheckedAt: now() })
          .where(eq(bookmarks.id, row.id))
          .run();
        summary.skipped++;
        continue;
      }

      const broken = !result.ok;
      db.update(bookmarks)
        .set({ isBroken: broken, lastCheckedAt: now() })
        .where(eq(bookmarks.id, row.id))
        .run();

      summary.checked++;
      if (broken) summary.broken++;
      else if (row.isBroken) summary.recovered++;
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  summary.durationMs = Date.now() - started;
  return summary;
}
