"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import {
  createBackup,
  deleteBackup,
  listBackups,
  restoreBackup,
  type BackupInfo,
} from "./service";

export type BackupActionResult = {
  ok: boolean;
  error?: string;
  name?: string;
  safety?: string;
  backups?: BackupInfo[];
};

export async function backupNow(): Promise<BackupActionResult> {
  await requireAdmin();
  try {
    const name = await createBackup("manual");
    revalidatePath("/settings");
    return { ok: true, name, backups: listBackups() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "备份失败" };
  }
}

export async function removeBackup(name: string): Promise<BackupActionResult> {
  await requireAdmin();
  try {
    deleteBackup(name);
    revalidatePath("/settings");
    return { ok: true, backups: listBackups() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "删除失败" };
  }
}

export async function restoreFromBackup(name: string): Promise<BackupActionResult> {
  await requireAdmin();
  try {
    const { safety } = await restoreBackup(name);
    revalidatePath("/");
    revalidatePath("/bookmarks");
    revalidatePath("/categories");
    revalidatePath("/dashboard");
    revalidatePath("/settings");
    return { ok: true, safety, backups: listBackups() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "恢复失败" };
  }
}

export async function refreshBackups(): Promise<BackupInfo[]> {
  await requireAdmin();
  return listBackups();
}
