"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { buildPreview, runImport, type ImportPreview, type ImportResult } from "./service";
import type { TransferFormat } from "./formats";

export type ImportState = { ok: boolean; error?: string; preview?: ImportPreview; digest?: string; result?: ImportResult } | null;
const MAX_BYTES = 10 * 1024 * 1024;

async function readUpload(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("没有选择文件");
  if (file.size > MAX_BYTES) throw new Error("文件超过 10MB");
  const extension = /\.(html?|json|csv)$/i.exec(file.name)?.[1].toLowerCase();
  if (!extension) throw new Error("只支持 HTML、JSON 或 CSV 书签文件");
  const format: TransferFormat = extension === "htm" ? "html" : extension as TransferFormat;
  const buf = Buffer.from(await file.arrayBuffer());
  const digest = createHash("sha256").update(format).update("\0").update(buf).digest("hex");
  try {
    return { raw: new TextDecoder("utf-8", { fatal: true }).decode(buf), format, digest };
  } catch {
    if (format === "json") throw new Error("JSON 文件必须使用 UTF-8 编码");
    return { raw: new TextDecoder("gb18030").decode(buf), format, digest };
  }
}

export async function previewImport(_prev: ImportState, formData: FormData): Promise<ImportState> {
  await requireAdmin();
  try {
    const file = await readUpload(formData);
    return { ok: true, preview: buildPreview(file.raw, file.format), digest: file.digest };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "解析失败" };
  }
}

export async function confirmImport(_prev: ImportState, formData: FormData): Promise<ImportState> {
  await requireAdmin();
  try {
    const file = await readUpload(formData);
    if (formData.get("digest") !== file.digest) throw new Error("文件已变化，请重新预览后确认导入");
    const result = runImport(file.raw, {
      mapFolders: formData.get("mapFolders") === "true",
      applySettings: file.format === "json" && formData.get("applySettings") === "true",
      preserveVisibility: file.format !== "html" && formData.get("preserveVisibility") === "true",
    }, file.format);
    for (const path of ["/", "/bookmarks", "/categories", "/settings", "/search", "/dashboard"]) revalidatePath(path);
    revalidatePath("/c/[slug]", "page");
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "导入失败" };
  }
}
