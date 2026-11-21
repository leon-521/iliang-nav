"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { isCheckRunning, runLinkCheck, type CheckSummary } from "./runner";

/**
 * 手动触发一轮检测。
 * 返回摘要给按钮显示结果；已经在跑就直接说一声，不排队。
 */
export async function triggerLinkCheck(): Promise<{
  ok: boolean;
  running?: boolean;
  summary?: CheckSummary;
  error?: string;
}> {
  await requireAdmin();

  if (isCheckRunning()) {
    return { ok: false, running: true, error: "正在检测中，请稍候" };
  }

  try {
    const summary = await runLinkCheck();
    revalidatePath("/bookmarks");
    revalidatePath("/dashboard");
    return { ok: true, summary };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "检测失败" };
  }
}
