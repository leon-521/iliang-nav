"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { bookmarks, categories } from "@/lib/db/schema";
import { replaceBookmarkTags, tagsByBookmark } from "@/lib/bookmarks/tag-store";
import { checkUrl, type CheckResult } from "@/lib/links/check";
import { BlockedHostError } from "@/lib/net/guard";
import { linkTransport, providerEndpoint, withinDeadline } from "./network";
import { complete, parseSuggestion, ProviderError, providerSchema } from "./provider";
import { mergeSuggestedTags, suggestFromPage, type EvidenceSource, type EvidenceStrength } from "./enrichment";
import { readProvider, removeProvider, saveProvider } from "./settings";

export async function loadAiSettings() {
  await requireAdmin();
  try {
    const provider = readProvider();
    return { endpoint: provider?.endpoint ?? "", model: provider?.model ?? "", configured: !!provider };
  } catch { return { endpoint: "", model: "", configured: false, error: "无法读取供应商设置，请检查服务端密钥或重新配置。" }; }
}

export async function storeAiSettings(formData: FormData) {
  await requireAdmin();
  const input = z.object({ endpoint: z.string().trim().min(1).max(2048), model: z.string().trim().min(1).max(160), key: z.string().trim().max(2048) }).safeParse({ endpoint: formData.get("endpoint"), model: formData.get("model"), key: formData.get("key") });
  if (!input.success) return { ok: false, error: "请填写有效的 API 地址、模型和密钥。" };
  try {
    const endpoint = providerEndpoint(input.data.endpoint).href;
    let key = input.data.key;
    if (!key) {
      const current = readProvider();
      if (!current || current.endpoint !== endpoint) return { ok: false, error: "首次设置或更换 API 地址时需要重新输入密钥。" };
      key = current.key;
    }
    const cfg = providerSchema.safeParse({ endpoint, model: input.data.model, key });
    if (!cfg.success || endpoint.includes(key)) return { ok: false, error: "模型或密钥格式不正确，密钥不可放在 URL 中。" };
    saveProvider(cfg.data);
    return { ok: true, endpoint, model: cfg.data.model };
  } catch (e) {
    return { ok: false, error: e instanceof BlockedHostError ? e.message : "无法保存供应商，请检查服务端密钥与文件权限。" };
  }
}

export async function clearAiSettings(confirmed: boolean) {
  await requireAdmin();
  if (confirmed !== true) return { ok: false, error: "请先确认移除。" };
  try { removeProvider(); return { ok: true }; }
  catch { return { ok: false, error: "无法移除供应商设置。" }; }
}

export async function testAiSettings(confirmed: boolean) {
  const admin = await requireAdmin();
  if (confirmed !== true) return { ok: false, error: "请先确认向已保存的供应商发送测试请求。" };
  if (busy.has(admin.userId)) return { ok: false, error: "已有请求运行中，请稍候。" };
  busy.add(admin.userId);
  try {
    const provider = readProvider();
    if (!provider) return { ok: false, error: "请先保存供应商设置。" };
    if (!(await complete(provider, "Reply with one word: OK.", {}))) throw new ProviderError("供应商返回空文本。");
    return { ok: true };
  } catch (e) { return { ok: false, error: safeMessage(e) }; }
  finally { busy.delete(admin.userId); }
}

const AiIntentSchema = z.enum(["link", "metadata", "category", "all"]);
export type AiIntent = z.infer<typeof AiIntentSchema>;
type PreviewValues = { title?: string; description?: string; categoryId?: string; categoryName?: string; tags?: string[] };
export type LinkEvidence = { result: "reachable" | "unavailable" | "unknown"; status: number | null; reason: CheckResult["reason"] };
export type AiPreview = { token?: string; values: PreviewValues; note?: string; evidence?: LinkEvidence; advisoryError?: string };
type Row = typeof bookmarks.$inferSelect;
type Pending = { owner: string; id: string; snapshot: string; expires: number; tagsSnapshot?: string; values: PreviewValues };
const lifetime = 10 * 60 * 1000;
const pending = new Map<string, Pending>();
const busy = new Set<string>();
const Fields = z.enum(["title", "description", "categoryId", "tags"]);

function safeMessage(e: unknown) {
  return e instanceof ProviderError || e instanceof BlockedHostError ? e.message : "AI 操作失败，请检查供应商设置后重试。";
}

function bookmarkSnapshot(row: Row) {
  return JSON.stringify([row.url, row.title, row.description, row.categoryId, row.visibility, row.effectiveVisibility, row.updatedAt]);
}

function linkEvidence(probe: CheckResult): LinkEvidence {
  const definitelyGone = probe.reason === "not_found" && (probe.status === null || probe.status === 404 || probe.status === 410);
  return {
    result: definitelyGone ? "unavailable" : probe.status && probe.status >= 200 && probe.status < 300 ? "reachable" : "unknown",
    status: probe.status,
    reason: probe.reason === "not_found" && !definitelyGone ? "network_error" : probe.reason,
  };
}

function listAiCategories() {
  return db.select({ id: categories.id, name: categories.name, parentId: categories.parentId })
    .from(categories).orderBy(asc(categories.sortOrder)).limit(160).all();
}

const QuickAddMode = z.enum(["details", "category", "tags", "all"]);
export type AiQuickAddMode = z.infer<typeof QuickAddMode>;
const SuppliedEvidence = z.object({
  title: z.string().max(300).optional(),
  description: z.string().max(500).optional(),
  text: z.string().max(8000).optional(),
}).strict();

/** Produces an editable draft, never a bookmark mutation. */
export async function previewAiQuickAdd(rawUrl: unknown, confirmed: boolean, mode: AiQuickAddMode = "all", evidence?: unknown): Promise<{ ok: true; draft: PreviewValues; source: EvidenceSource; strength: EvidenceStrength } | { ok: false; error: string }> {
  const admin = await requireAdmin();
  const url = z.string().trim().min(1).max(2048).safeParse(rawUrl);
  const fields = QuickAddMode.safeParse(mode);
  if (confirmed !== true || !url.success) return { ok: false, error: "请填写网址，并确认允许发送网页节选。" };
  if (!fields.success) return { ok: false, error: "请选择有效的 AI 操作。" };
  const supplied = SuppliedEvidence.optional().safeParse(evidence);
  if (!supplied.success) return { ok: false, error: "提供的页面内容格式或长度不符合要求。" };
  if (busy.has(admin.userId)) return { ok: false, error: "已有请求运行中，请稍候。" };
  busy.add(admin.userId);
  try {
    const provider = readProvider();
    if (!provider) throw new ProviderError("请先在设置中配置 AI 供应商。");
    const choices = fields.data === "category" || fields.data === "all" ? listAiCategories() : [];
    if (fields.data === "category" && !choices.length) throw new ProviderError("还没有分类，请先创建分类。");
    const { source, strength, ...draft } = await suggestFromPage(provider, url.data, choices, { fields: fields.data, evidence: supplied.data });
    return { ok: true, draft, source, strength };
  } catch (e) { return { ok: false, error: safeMessage(e) }; }
  finally { busy.delete(admin.userId); }
}

export async function previewAiBookmark(id: string, intent: AiIntent, confirmed: boolean): Promise<{ ok: true; preview: AiPreview } | { ok: false; error: string }> {
  const admin = await requireAdmin();
  if (confirmed !== true || !z.string().uuid().safeParse(id).success || !AiIntentSchema.safeParse(intent).success) {
    return { ok: false, error: "选择一条书签、操作类型并确认后再试。" };
  }
  if (busy.has(admin.userId)) return { ok: false, error: "已有请求运行中，请稍候。" };
  busy.add(admin.userId);
  try {
    const row = db.select().from(bookmarks).where(eq(bookmarks.id, id)).get();
    if (!row) return { ok: false, error: "书签已不存在。" };
    if (intent === "metadata" && row.description?.trim() && row.title.trim() && row.title !== row.url) {
      return { ok: false, error: "标题与描述均已填写；补全不会覆盖现有内容。" };
    }
    let evidence: LinkEvidence | undefined;
    if (intent === "link") {
      try {
        evidence = linkEvidence(await withinDeadline(15000, (signal) => checkUrl(row.url, linkTransport(undefined, signal), true)));
      } catch {
        evidence = { result: "unknown", status: null, reason: "timeout" };
      }
    }
    const values: PreviewValues = {};
    const originalTags = intent === "link" ? [] : tagsByBookmark([row.id]).get(row.id) ?? [];
    let note: string | undefined;
    try {
      const provider = readProvider();
      if (!provider) throw new ProviderError("请先在设置中配置 AI 供应商。");
      if (evidence) {
        const system = "Return one JSON object with only note (Simplified Chinese, max 500 characters), interpreting the probe. Do not decide whether a link is live or call tools.";
        const text = await complete(provider, system, { probe: evidence });
        note = parseSuggestion(text, provider.key, new Set()).note ?? undefined;
      } else if (intent !== "link") {
        const choices = intent === "metadata" ? [] : listAiCategories();
        if (intent === "category" && !choices.length) throw new ProviderError("还没有分类，请先创建分类。");
        const result = await suggestFromPage(provider, row.url, choices, { fields: intent });
        if ((!row.title.trim() || row.title === row.url) && result.title) values.title = result.title;
        if ((!row.description?.trim() || intent === "all") && result.description && result.description !== row.description) values.description = result.description;
        if (result.tags?.length) {
          const picked = mergeSuggestedTags(originalTags, result.tags);
          if (picked.length) values.tags = picked;
        }
        if (result.categoryId && result.categoryId !== row.categoryId) {
          values.categoryId = result.categoryId;
          values.categoryName = choices.find((item) => item.id === result.categoryId)?.name;
        }
      }
    } catch (e) {
      if (evidence) return { ok: true, preview: { values, evidence, advisoryError: safeMessage(e) } };
      throw e;
    }
    if (Object.keys(values).length === 0) return { ok: true, preview: { values, evidence, note } };
    for (const [token, entry] of pending) if (entry.expires <= Date.now()) pending.delete(token);
    if (pending.size >= 128) pending.delete(pending.keys().next().value!);
    const token = randomUUID();
    pending.set(token, { owner: admin.userId, id, expires: Date.now() + lifetime, snapshot: bookmarkSnapshot(row), tagsSnapshot: values.tags ? JSON.stringify(originalTags) : undefined, values });
    return { ok: true, preview: { token, values } };
  } catch (e) { return { ok: false, error: safeMessage(e) }; }
  finally { busy.delete(admin.userId); }
}

const ApplyEntry = z.object({
  token: z.string().uuid(),
  fields: z.array(Fields).min(1).max(4).refine((fields) => new Set(fields).size === fields.length),
}).strict();
type ApplyResult = { ok: true } | { ok: false; error: string };

function applyPreview(userId: string, { token, fields }: z.infer<typeof ApplyEntry>): ApplyResult {
  const entry = pending.get(token);
  if (!entry || entry.owner !== userId || entry.expires <= Date.now()) return { ok: false, error: "建议已过期或已使用，请重新生成。" };
  if (fields.some((field) => !entry.values[field])) return { ok: false, error: "建议中没有该字段。" };
  pending.delete(token);
  try {
    db.transaction((tx) => {
      const row = tx.select().from(bookmarks).where(eq(bookmarks.id, entry.id)).get();
      if (!row || bookmarkSnapshot(row) !== entry.snapshot) throw new ProviderError("书签已被修改，请重新生成建议。");
      const values: Partial<typeof bookmarks.$inferInsert> = { updatedAt: Math.floor(Date.now() / 1000) };
      if (fields.includes("title")) values.title = entry.values.title;
      if (fields.includes("description")) values.description = entry.values.description;
      if (fields.includes("categoryId")) {
        const category = tx.select().from(categories).where(eq(categories.id, entry.values.categoryId!)).get();
        if (!category) throw new ProviderError("所选分类已不存在，请重新生成建议。");
        // Categories also gate public reads. Never move a restricted category's bookmark into
        // a public category with a public flag, even if its saved effective flag was public.
        const old = row.categoryId ? tx.select().from(categories).where(eq(categories.id, row.categoryId)).get() : undefined;
        const preserve = old && old.visibility !== "public" && row.effectiveVisibility === "public" ? "private" : row.effectiveVisibility;
        values.categoryId = category.id;
        values.effectiveVisibility = preserve;
        if ((row.visibility ?? category.visibility) !== preserve) values.visibility = preserve;
      }
      if (fields.includes("tags")) {
        const currentTags = tagsByBookmark([row.id]).get(row.id) ?? [];
        if (JSON.stringify(currentTags) !== entry.tagsSnapshot) throw new ProviderError("标签已被修改，请重新生成建议。");
        replaceBookmarkTags(tx, row.id, [...currentTags, ...entry.values.tags!]);
      }
      tx.update(bookmarks).set(values).where(eq(bookmarks.id, row.id)).run();
    });
    return { ok: true };
  } catch (e) { return { ok: false, error: safeMessage(e) }; }
}

// Matches the dialog selection cap. A larger or duplicate payload is rejected before any write.
const ApplyBatch = z.array(ApplyEntry).min(1).max(8).refine((entries) =>
  new Set(entries.map(({ token }) => token)).size === entries.length,
);

type BatchApplyResult =
  | { ok: false; error: string }
  | { ok: true; results: Array<ApplyResult & { token: string }> };

export async function applyAiBookmarks(entries: unknown, confirmed: boolean): Promise<BatchApplyResult> {
  const admin = await requireAdmin();
  const parsed = ApplyBatch.safeParse(entries);
  if (confirmed !== true || !parsed.success) {
    return { ok: false, error: "请勾选需要应用的建议并确认（每次最多 8 条书签）。" };
  }
  // Each item retains its independent transaction, ownership, expiry, and snapshot check.
  const results = parsed.data.map((entry) => ({ token: entry.token, ...applyPreview(admin.userId, entry) }));
  if (results.some(({ ok }) => ok)) {
    revalidatePath("/bookmarks");
    revalidatePath("/");
    revalidatePath("/search");
    revalidatePath("/c/[slug]", "page");
  }
  return { ok: true, results };
}
