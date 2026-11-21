import { z } from "zod";
import { providerEndpoint, requestPinned, withinDeadline, type SafeRequest } from "./network";

export const providerSchema = z.object({
  endpoint: z.string().trim().min(1).max(2048),
  model: z.string().trim().min(1).max(160).regex(/^[\w./:@+-]+$/),
  key: z.string().trim().min(1).max(2048).regex(/^[\x21-\x7e]+$/),
});
export type Provider = z.infer<typeof providerSchema>;

export class ProviderError extends Error {}

export async function complete(provider: Provider, system: string, data: unknown, send: SafeRequest = requestPinned) {
  const endpoint = providerEndpoint(provider.endpoint);
  const body = JSON.stringify({
    model: provider.model,
    messages: [{ role: "system", content: system }, { role: "user", content: JSON.stringify(data) }],
    stream: false,
    max_tokens: 800,
  });
  let res;
  try {
    res = await withinDeadline(20000, (signal) => send(endpoint, {
      method: "POST", signal, body, maxBytes: 65536,
      headers: { authorization: `Bearer ${provider.key}`, "content-type": "application/json", "content-length": String(Buffer.byteLength(body)), accept: "application/json" },
    }));
  } catch (e) {
    if (e instanceof Error && e.name === "BlockedHostError") throw new ProviderError("供应商地址解析到受限网络，已阻止请求。");
    throw new ProviderError("无法安全连接供应商，或请求超时。");
  }
  if (res.status >= 300 && res.status < 400) throw new ProviderError("供应商返回重定向；为保护密钥，已拒绝跟随。");
  if (res.status < 200 || res.status >= 300) throw new ProviderError(`供应商请求失败（HTTP ${res.status}）。`);
  try {
    const message = JSON.parse(res.body).choices?.[0]?.message;
    if (message?.tool_calls?.length || message?.function_call || typeof message?.content !== "string" || message.content.length > 8000) throw new Error();
    return message.content.trim();
  } catch { throw new ProviderError("供应商未返回兼容的文本响应。"); }
}

const resultSchema = z.object({
  title: z.string().trim().min(1).max(300).nullish(),
  description: z.string().trim().min(1).max(500).nullish(),
  categoryId: z.string().uuid().nullish(),
  note: z.string().trim().min(1).max(500).nullish(),
  tags: z.array(z.string().trim().min(1).max(64)).max(12).nullish(),
}).strict();

export function parseSuggestion(text: string, key: string, allowedCategories: ReadonlySet<string>) {
  try {
    const result = resultSchema.parse(JSON.parse(text.replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i, "$1")));
    if (Object.values(result).flat().some((v) => v?.includes(key))) throw new Error();
    if (result.categoryId && !allowedCategories.has(result.categoryId)) throw new Error();
    return result;
  } catch { throw new ProviderError("模型未给出有效的 JSON 建议，请缩小范围或更换模型后重试。"); }
}
