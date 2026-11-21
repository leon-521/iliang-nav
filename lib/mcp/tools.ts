import { randomUUID } from "node:crypto";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { bookmarks, categories, clicks, shareLinks } from "@/lib/db/schema";
import { normalizeUrl, hashUrl } from "@/lib/import/url";
import { parseBookmarkTags } from "@/lib/bookmarks/tags";
import { replaceBookmarkTags, tagsByBookmark } from "@/lib/bookmarks/tag-store";
import { visibleWhere } from "@/lib/visibility";
import type { McpScope } from "./common";
import type { Principal } from "./credentials";

const id = z.string().uuid();
const visibility = z.enum(["private", "unlisted", "public"]);
const paging = { limit: z.number().int().min(1).max(50).default(20), offset: z.number().int().min(0).max(100_000).default(0) };
const order = z.number().int().min(-9999).max(9999);
const link = z.string().trim().min(1).max(2000);
const name = z.string().trim().min(1).max(60);
const bookmarkFields = {
  url: link,
  altUrl: link.nullable().optional(),
  title: z.string().trim().min(1).max(300).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  categoryId: id.nullable().optional(),
  visibility: visibility.nullable().optional(),
  sortOrder: order.optional(),
  tags: z.string().max(1024).describe("Comma-separated tags, up to 12; empty string clears tags.").optional(),
};
class ToolError extends Error {}
const category = (key: string) => db.select().from(categories).where(eq(categories.id,key)).get();
function writableCategory(key: string, principal: Principal) {
  const row = category(key);
  if (!row || (row.visibility !== "public" && !principal.scopes.includes("read_private"))) throw new ToolError("分类不存在或不可操作。");
  return row;
}
function writableBookmark(key: string, principal: Principal) {
  const row = db.select().from(bookmarks).where(eq(bookmarks.id,key)).get();
  const isPublic = row?.effectiveVisibility === "public" && (!row.categoryId || category(row.categoryId)?.visibility === "public");
  if (!row || (!isPublic && !principal.scopes.includes("read_private"))) throw new ToolError("书签不存在或不可操作。");
  return row;
}
const changed = () => Math.floor(Date.now()/1000);
function normalized(value: string) {
  let original: URL;
  try { original = new URL(value); }
  catch { try { original = new URL(`https://${value}`); } catch { throw new ToolError("网址必须是有效的 HTTP/HTTPS 地址。"); } }
  if (original.username || original.password) throw new ToolError("网址不能包含登录凭据。");
  const url = normalizeUrl(value);
  if (!url || url.length > 2000) throw new ToolError("网址必须是有效的 HTTP/HTTPS 地址。");
  return url;
}
function tags(value?: string) {
  if (value === undefined) return;
  const parsed = parseBookmarkTags(value);
  if (parsed.error) throw new ToolError(parsed.error);
  return parsed.tags;
}
function confirmDelete(key: string, confirmation: string) {
  if (confirmation !== `DELETE:${key}`) throw new ToolError("永久删除必须明确提交 DELETE:<id>。");
}
function viewerFor(principal: Principal) {
  return principal.scopes.includes("read_private") ? { kind: "admin", userId: principal.id, email: "" } as const : { kind: "anonymous" } as const;
}
function tool<S extends z.ZodType>(description: string, scopes: McpScope[], schema: S, run: (args: z.output<S>, principal: Principal) => unknown) {
  return { description, scopes, schema, execute: (args: unknown, principal: Principal) => {
    const result = schema.safeParse(args);
    if (!result.success) throw new ToolError("工具参数无效，请检查输入结构与取值范围。");
    return run(result.data, principal);
  } };
}

const tools = {
  list_bookmarks: tool("List bookmarks with tags, ordered by their sort order. Returns up to 50 records; private visibility needs read_private.", ["read"], z.strictObject({ ...paging, categoryId: id.nullable().optional() }), (a,p) => {
    const rows = db.select({ id: bookmarks.id, title: bookmarks.title, url: bookmarks.url, altUrl: bookmarks.altUrl, description: bookmarks.description, categoryId: bookmarks.categoryId, visibility: bookmarks.effectiveVisibility, sortOrder: bookmarks.sortOrder }).from(bookmarks).leftJoin(categories,eq(bookmarks.categoryId,categories.id)).where(and(visibleWhere(viewerFor(p)),a.categoryId === null ? isNull(bookmarks.categoryId) : a.categoryId ? eq(bookmarks.categoryId,a.categoryId) : undefined)).orderBy(asc(bookmarks.sortOrder),asc(bookmarks.createdAt),asc(bookmarks.id)).limit(a.limit+1).offset(a.offset).all();
    const slice = rows.slice(0,a.limit);
    const labels = tagsByBookmark(slice.map(({id})=>id));
    return { items: slice.map((row) => ({...row,tags:labels.get(row.id) ?? []})), nextOffset: rows.length > a.limit ? a.offset+a.limit : null };
  }),
  list_categories: tool("List category IDs, parents, names and order. Private visibility needs read_private.", ["read"], z.strictObject(paging), (a,p) => {
    const rows = db.select({ id:categories.id,parentId:categories.parentId,name:categories.name,slug:categories.slug,sortOrder:categories.sortOrder,visibility:categories.visibility }).from(categories).where(p.scopes.includes("read_private") ? undefined : eq(categories.visibility,"public")).orderBy(asc(categories.sortOrder),asc(categories.createdAt),asc(categories.id)).limit(a.limit+1).offset(a.offset).all();
    return { items: rows.slice(0,a.limit), nextOffset: rows.length > a.limit ? a.offset+a.limit : null };
  }),
  add_bookmark: tool("Add a bookmark without any network access. It is private by default; explicit null visibility inherits the selected category.", ["write"], z.strictObject(bookmarkFields), (a,p) => db.transaction((tx) => {
    const url = normalized(a.url), hash = hashUrl(url), categoryId = a.categoryId ?? null;
    const cat = categoryId ? writableCategory(categoryId,p) : undefined;
    const labels = tags(a.tags);
    if (tx.select({id:bookmarks.id}).from(bookmarks).where(eq(bookmarks.urlHash,hash)).get()) throw new ToolError("该网址已存在。");
    const bookmarkId = randomUUID();
    const own = a.visibility === undefined ? "private" : a.visibility;
    tx.insert(bookmarks).values({ id:bookmarkId, title:a.title ?? url, url,urlHash:hash,altUrl:a.altUrl ? normalized(a.altUrl) : null,description:a.description || null,categoryId,visibility:own,effectiveVisibility:own ?? cat?.visibility ?? "private",sortOrder:a.sortOrder ?? 0 }).run();
    if (labels) replaceBookmarkTags(tx,bookmarkId,labels);
    return { id:bookmarkId };
  })),
  update_bookmark: tool("Update supplied fields of one bookmark. Omitted fields are preserved. Explicit null clears nullable fields.", ["write"], z.strictObject({ ...bookmarkFields, url:link.optional(), id }), (a,p) => db.transaction((tx) => {
    const row = writableBookmark(a.id,p), categoryId = a.categoryId === undefined ? row.categoryId : a.categoryId;
    const dest = categoryId ? writableCategory(categoryId,p) : undefined;
    let own = a.visibility === undefined ? row.visibility : a.visibility;
    const visible = own ?? dest?.visibility ?? "private";
    if (a.visibility === undefined && a.categoryId !== undefined && visible === "public" && (row.effectiveVisibility !== "public" || (row.categoryId && category(row.categoryId)?.visibility !== "public"))) own = "private";
    const url = a.url === undefined ? row.url : normalized(a.url), hash = hashUrl(url);
    const collision = tx.select({id:bookmarks.id}).from(bookmarks).where(eq(bookmarks.urlHash,hash)).get();
    if (collision && collision.id !== a.id) throw new ToolError("该网址已存在。");
    const labels = tags(a.tags);
    const urlChanged = url !== row.url;
    tx.update(bookmarks).set({ url,urlHash:hash,altUrl:a.altUrl === undefined ? row.altUrl : a.altUrl ? normalized(a.altUrl) : null, title:a.title ?? row.title, description:a.description === undefined ? row.description : a.description || null, categoryId, visibility:own,effectiveVisibility:own ?? dest?.visibility ?? "private",sortOrder:a.sortOrder ?? row.sortOrder,updatedAt:changed(), ...(urlChanged ? {isBroken:false,lastCheckedAt:null,...(row.iconSource === "fetched" ? {iconUrl:null,iconSource:"none"} : {})} : {}) }).where(eq(bookmarks.id,a.id)).run();
    if (labels) replaceBookmarkTags(tx,a.id,labels);
    return { id:a.id };
  })),
  hide_bookmark: tool("Make a bookmark private without deleting it.", ["write"], z.strictObject({id}), ({id},p) => {
    writableBookmark(id,p);
    if (!db.update(bookmarks).set({visibility:"private",effectiveVisibility:"private",updatedAt:changed()}).where(eq(bookmarks.id,id)).run().changes) throw new ToolError("书签不存在。");
    return { id };
  }),
  delete_bookmark: tool("Permanently delete ONE bookmark. Requires explicit human authorization, a delete-scoped credential and confirmation string DELETE:<id>.", ["write","delete"], z.strictObject({id,confirmation:z.string().max(64)}), (a,p) => db.transaction((tx) => {
    confirmDelete(a.id,a.confirmation);
    writableBookmark(a.id,p);
    if (!tx.delete(bookmarks).where(eq(bookmarks.id,a.id)).run().changes) throw new ToolError("书签不存在。");
    tx.delete(shareLinks).where(and(eq(shareLinks.targetType,"bookmark"),eq(shareLinks.targetId,a.id))).run();
    tx.delete(clicks).where(eq(clicks.bookmarkId,a.id)).run();
    return { id:a.id };
  })),
  reorder_bookmark: tool("Set a bookmark's integer sort order, smaller numbers first.", ["write"], z.strictObject({id,sortOrder:order}), (a,p) => {
    writableBookmark(a.id,p);
    if (!db.update(bookmarks).set({sortOrder:a.sortOrder,updatedAt:changed()}).where(eq(bookmarks.id,a.id)).run().changes) throw new ToolError("书签不存在。");
    return { id:a.id, sortOrder:a.sortOrder };
  }),
  add_category: tool("Create a category, private by default, at the end of its siblings.", ["write"], z.strictObject({name,parentId:id.nullable().optional(),visibility:visibility.optional()}), (a,p) => db.transaction((tx) => {
    const parentId = a.parentId ?? null;
    if (parentId) writableCategory(parentId,p);
    const cid = randomUUID();
    const slug = `${a.name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,"-").replace(/^-+|-+$/g,"") || "cat"}-${cid.slice(0,6)}`;
    const sibling = parentId ? eq(categories.parentId,parentId) : isNull(categories.parentId);
    const max = tx.select({value:sql<number>`coalesce(max(${categories.sortOrder}), -1)`}).from(categories).where(sibling).get()?.value ?? -1;
    tx.insert(categories).values({id:cid,name:a.name,slug,parentId,sortOrder:max+1,visibility:a.visibility ?? "private"}).run();
    return {id:cid,slug};
  })),
  update_category: tool("Rename a category or move it to another parent. Does not change publication state.", ["write"], z.strictObject({id,name:name.optional(),parentId:id.nullable().optional()}), (a,p) => db.transaction((tx) => {
    const row = writableCategory(a.id,p);
    const seen = new Set([a.id]);
    let cursor = a.parentId ?? null;
    while (cursor) {
      if (seen.has(cursor) || seen.size > 128) throw new ToolError("分类层级不合法。");
      seen.add(cursor);
      cursor = writableCategory(cursor,p).parentId;
    }
    tx.update(categories).set({name:a.name ?? row.name,parentId:a.parentId === undefined ? row.parentId : a.parentId}).where(eq(categories.id,a.id)).run();
    return {id:a.id};
  })),
  hide_category: tool("Make a category private and update inherited bookmark visibility, without deleting anything.", ["write"], z.strictObject({id}), (a,p) => db.transaction((tx) => {
    writableCategory(a.id,p);
    if (!tx.update(categories).set({visibility:"private"}).where(eq(categories.id,a.id)).run().changes) throw new ToolError("分类不存在。");
    tx.update(bookmarks).set({effectiveVisibility:"private",updatedAt:changed()}).where(and(eq(bookmarks.categoryId,a.id),isNull(bookmarks.visibility))).run();
    return {id:a.id};
  })),
  delete_category: tool("Permanently delete ONE empty category only. Requires explicit human authorization, delete scope and DELETE:<id>. No recursive deletion.", ["write","delete"], z.strictObject({id,confirmation:z.string().max(64)}), (a,p) => db.transaction((tx) => {
    confirmDelete(a.id,a.confirmation);
    writableCategory(a.id,p);
    if (tx.select({id:categories.id}).from(categories).where(eq(categories.parentId,a.id)).get() || tx.select({id:bookmarks.id}).from(bookmarks).where(eq(bookmarks.categoryId,a.id)).get()) throw new ToolError("只能删除空分类；请先手动迁移其内容。");
    tx.delete(categories).where(eq(categories.id,a.id)).run();
    tx.delete(shareLinks).where(and(eq(shareLinks.targetType,"category"),eq(shareLinks.targetId,a.id))).run();
    return {id:a.id};
  })),
  reorder_category: tool("Move a category one place up or down among siblings only.", ["write"], z.strictObject({id,direction:z.enum(["up","down"])}), (a,p) => db.transaction((tx) => {
    const row = writableCategory(a.id,p);
    if (row.parentId) writableCategory(row.parentId,p);
    const siblings = tx.select({id:categories.id,order:categories.sortOrder}).from(categories).where(row.parentId ? eq(categories.parentId,row.parentId) : isNull(categories.parentId)).orderBy(asc(categories.sortOrder),asc(categories.createdAt),asc(categories.id)).all();
    const from = siblings.findIndex(({id})=>id===a.id), to = from + (a.direction === "up" ? -1 : 1);
    if (to < 0 || to >= siblings.length) return { id:a.id, moved:false };
    writableCategory(siblings[to].id,p);
    [siblings[from],siblings[to]] = [siblings[to],siblings[from]];
    for (const [i,sibling] of siblings.entries()) if (i !== sibling.order) tx.update(categories).set({sortOrder:i}).where(eq(categories.id,sibling.id)).run();
    return {id:a.id,moved:true};
  })),
};
function allowed(scopes: McpScope[], principal: Principal) { return scopes.every((scope)=>principal.scopes.includes(scope)); }
export function listTools(principal: Principal) {
  return Object.entries(tools).filter(([,t])=>allowed(t.scopes,principal)).map(([name,t])=>({name,description:t.description,inputSchema:z.toJSONSchema(t.schema,{io:"input"}),annotations:{readOnlyHint:t.scopes.includes("read"),destructiveHint:t.scopes.includes("delete"),openWorldHint:false}}));
}
export function callTool(name: string, input: unknown, principal: Principal) {
  const t = Object.hasOwn(tools,name) ? tools[name as keyof typeof tools] : undefined;
  if (!t || !allowed(t.scopes,principal)) return { content:[{type:"text",text:"工具不存在或凭据没有权限。"}],isError:true };
  try {
    const result = t.execute(input ?? {},principal);
    if (t.scopes.includes("write")) for (const path of ["/", "/bookmarks", "/categories", "/search"]) revalidatePath(path);
    return {content:[{type:"text",text:JSON.stringify(result)}],structuredContent:result};
  } catch (e) {
    return {content:[{type:"text",text:e instanceof ToolError ? e.message : "操作失败，书签数据未能更新。"}],isError:true};
  }
}
