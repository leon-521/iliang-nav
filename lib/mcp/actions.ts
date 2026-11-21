"use server";

import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { configuredOrigin, SCOPES, validScopes } from "./common";
import { mcpStatus, mintCredential, revokeCredential, setMcpEnabled } from "./credentials";

export async function getMcpSettings() {
  await requireAdmin();
  return { ...mcpStatus(), origin: configuredOrigin() };
}

export async function toggleMcpSettings(enabled: boolean) {
  await requireAdmin();
  if (typeof enabled !== "boolean" || (enabled && !configuredOrigin())) return { error: "请先配置公开 HTTPS 站点地址；仅本机允许 HTTP。" };
  try { setMcpEnabled(enabled); return { ok:true }; }
  catch { return { error:"无法保存 MCP 设置，请检查服务端配置和文件权限。" }; }
}

const schema = z.strictObject({ label:z.string().trim().min(1).max(60), kind:z.enum(["bearer","oauth"]), scopes:z.array(z.enum(SCOPES)).min(1).max(4), days:z.number().int().min(1).max(365), confirmDelete:z.boolean() });
export async function createMcpCredential(input: unknown) {
  await requireAdmin();
  const parsed = schema.safeParse(input);
  if (!parsed.success || !validScopes(parsed.data.scopes)) return { error: "请输入有效的名称、权限和有效期。" };
  const {label,kind,scopes,days,confirmDelete} = parsed.data;
  if (scopes.includes("delete") && !confirmDelete) return { error:"请确认是否真的需要永久删除权限。" };
  try { return { credential:mintCredential(label,kind,scopes,days) }; }
  catch { return { error:"无法创建凭据。每个站点最多保留 32 个有效凭据，请检查配置或撤销不再使用的凭据。" }; }
}

export async function removeMcpCredential(id: string) {
  await requireAdmin();
  if (!z.string().uuid().safeParse(id).success) return { error:"凭据 ID 无效。" };
  try { revokeCredential(id); return { ok:true }; }
  catch { return { error:"无法撤销凭据，请稍后重试。" }; }
}
