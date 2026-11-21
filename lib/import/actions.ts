"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { buildPreview, runImport, type ImportPreview } from "@/lib/import/service";

export type ImportState = {
  ok: boolean;
  error?: string;
  preview?: ImportPreview;
  result?: { created: number; skipped: number; invalid: number; foldersCreated: number };
} | null;

const MAX_BYTES = 10 * 1024 * 1024;

async function readUpload(formData: FormData): Promise<string> {
  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("没有选择文件");
  if (file.size > MAX_BYTES) throw new Error("文件超过 10MB");
  if (!/\.html?$/i.test(file.name)) throw new Error("只支持 .html 书签文件");

  const buf = Buffer.from(await file.arrayBuffer());

  // 编码嗅探：优先 UTF-8，失败回退 GBK（国内浏览器导出常见）
  const utf8 = buf.toString("utf8");
  if (!utf8.includes("\uFFFD")) return utf8;

  try {
    const decoder = new TextDecoder("gbk");
    return decoder.decode(buf);
  } catch {
    return utf8;
  }
}

/** 第一步：上传 → 解析 → 预览（不落库） */
export async function previewImport(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  await requireAdmin();
  try {
    const html = await readUpload(formData);
    const preview = buildPreview(html);
    return { ok: true, preview };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "解析失败" };
  }
}

/** 第二步：确认 → 落库
 *
 * 收的是原始 File 而不是客户端解码后的字符串。
 * 之前前端用 `file.text()`（永远按 UTF-8）把内容解一遍再回传，
 * GBK 导出的文件在预览时服务端能正确回退解码，确认时却拿到一堆 U+FFFD，
 * 中文标题和分类名就乱了。现在两步共用同一个服务端解码器。
 */
export async function confirmImport(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  await requireAdmin();
  try {
    const mapFolders = formData.get("mapFolders") === "true";
    const html = await readUpload(formData);
    const result = runImport(html, { mapFolders });
    revalidatePath("/");
    revalidatePath("/bookmarks");
    revalidatePath("/categories");
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "导入失败" };
  }
}
