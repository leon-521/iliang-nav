import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { isCheckRunning, runLinkCheck } from "./runner";

/**
 * 链接检测的定时调度。
 *
 * 不用宿主机 cron：容器里跑个定时器就够，部署时不用再教人配 crontab，
 * 也不会出现「换台机器忘了配」的情况。
 *
 * 用 settings 表记上次运行时间，所以重启容器不会立刻又跑一轮
 * （除非确实到了间隔）。
 */

const LAST_RUN_KEY = "link_check_last_run";
const CHECK_TICK_MS = 30 * 60 * 1000; // 每 30 分钟看一次该不该跑
const START_DELAY_MS = 90 * 1000; // 启动后等 90 秒，别和迁移抢资源

function hours(): number {
  const raw = Number(process.env.LINK_CHECK_INTERVAL_HOURS ?? "24");
  return Number.isFinite(raw) && raw > 0 ? raw : 24;
}

function lastRun(): number {
  const row = db.select().from(settings).where(eq(settings.key, LAST_RUN_KEY)).get();
  const n = Number(row?.value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function markRun() {
  const value = String(Math.floor(Date.now() / 1000));
  db.insert(settings)
    .values({ key: LAST_RUN_KEY, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })
    .run();
}

async function tick(reason: string) {
  if (isCheckRunning()) return;

  const intervalSec = hours() * 3600;
  const elapsed = Math.floor(Date.now() / 1000) - lastRun();
  if (elapsed < intervalSec) return;

  try {
    const s = await runLinkCheck();
    markRun();
    console.log(
      `[link-check] ${reason}: 检测 ${s.checked}/${s.total}，失效 ${s.broken}，恢复 ${s.recovered}，跳过 ${s.skipped}，耗时 ${s.durationMs}ms`,
    );
  } catch (e) {
    console.error("[link-check] 失败:", e instanceof Error ? e.message : e);
  }
}

let started = false;

export function startLinkScheduler() {
  if (started) return;
  if (process.env.LINK_CHECK_ENABLED === "0") {
    console.log("[link-check] 已通过 LINK_CHECK_ENABLED=0 关闭");
    return;
  }
  started = true;

  const h = hours();
  console.log(`[link-check] 调度已启动，间隔 ${h} 小时`);

  setTimeout(() => void tick("启动检查"), START_DELAY_MS);

  const timer = setInterval(() => void tick("定时检查"), CHECK_TICK_MS);
  // 别让定时器把进程钉住（容器里其实无所谓，但本地 dev 会烦）
  timer.unref?.();
}
