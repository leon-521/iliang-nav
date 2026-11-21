"use server";

import { randomUUID } from "node:crypto";
import { requireAdmin } from "@/lib/auth/session";
import { collectionUrl, configFields, errorText, type DisplayConfig } from "./config";
import { validateOrigin } from "./network";
import { webDavRuntime } from "./runner";
import { runWebDavBackup } from "./scheduler";
import { readConfig, readState, removeConfig, writeConfig } from "./storage";

export async function getWebDavSettings(): Promise<{ ok: true; value: DisplayConfig; schedulerAvailable: boolean } | { ok: false; error: string }> {
  await requireAdmin();
  try {
    const config = readConfig();
    const previous = config ? readState(config.revision) : null;
    const state = previous?.result === "running" && !webDavRuntime.running
      ? { ...previous, result: "failed" as const, error: "服务在上次备份结束前重启。" }
      : previous;
    return { ok: true, value: {
      endpoint: config?.endpoint ?? "",
      username: config?.username ?? "",
      intervalHours: config?.intervalHours ?? 24,
      enabled: config?.enabled ?? false,
      configured: Boolean(config),
      state,
    }, schedulerAvailable: process.env.WEBDAV_SCHEDULER_ENABLED !== "0" };
  } catch {
    return { ok: false, error: "无法读取 WebDAV 设置，请检查服务端加密密钥；你也可以移除设置并重新配置。" };
  }
}

export async function saveWebDavSettings(form: FormData) {
  await requireAdmin();
  if (webDavRuntime.running) return { ok: false, error: "请等待当前备份完成后再修改设置。" };
  const endpoint = form.get("endpoint");
  const username = form.get("username");
  const password = form.get("password");
  const hours = form.get("intervalHours");
  const enabled = form.get("enabled") === "on";
  if (typeof endpoint !== "string" || endpoint.length > 2048 || typeof username !== "string" ||
      typeof password !== "string" || typeof hours !== "string" || !/^\d{1,3}$/.test(hours)) {
    return { ok: false, error: "请填写有效的地址、账号、密钥和备份间隔。" };
  }
  if (enabled && form.get("authorizeSchedule") !== "on") return { ok: false, error: "请明确授权按计划将数据库上传到目标服务。" };
  if (enabled && process.env.WEBDAV_SCHEDULER_ENABLED === "0") return { ok: false, error: "服务端已禁用定时任务。" };
  try {
    const url = collectionUrl(endpoint.trim());
    validateOrigin(url);
    const current = readConfig();
    const sameConnection = url.href === current?.endpoint && username.trim() === current.username;
    if (!password && !sameConnection) return { ok: false, error: "首次保存或更换地址、账号时，请输入 WebDAV 密钥。" };
    const parsed = configFields.safeParse({ endpoint: url.href, username, password: password || current?.password, intervalHours: Number(hours), enabled });
    if (!parsed.success) return { ok: false, error: "账号格式不正确或间隔不在 1–168 小时内。" };
    // Changing the upload destination starts a new history. Changing the interval does not.
    writeConfig({ ...parsed.data, revision: sameConnection ? current.revision : randomUUID() });
    return { ok: true };
  } catch (error) { return { ok: false, error: errorText(error) }; }
}

export async function clearWebDavSettings(confirmed: boolean) {
  await requireAdmin();
  if (confirmed !== true) return { ok: false, error: "请先确认移除设置。" };
  if (webDavRuntime.running) return { ok: false, error: "请等待当前备份完成。" };
  try { removeConfig(); return { ok: true }; }
  catch (error) { return { ok: false, error: errorText(error) }; }
}

export async function backupToWebDavNow(confirmed: boolean) {
  await requireAdmin();
  if (confirmed !== true) return { ok: false, error: "请先确认上传数据库快照。" };
  return runWebDavBackup(true);
}
