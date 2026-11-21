export const MCP_SCOPES = {
  read: "读取公开书签和分类",
  read_private: "同时读取非公开书签和分类",
  write: "添加、修改、隐藏和排序书签及分类",
  delete: "永久删除书签及空分类",
} as const;
export type McpScope = keyof typeof MCP_SCOPES;
export const SCOPES = Object.keys(MCP_SCOPES) as McpScope[];
export type CredentialKind = "bearer" | "oauth";

export function validScopes(scopes: string[]): scopes is McpScope[] {
  return scopes.length > 0 && scopes.length <= SCOPES.length && new Set(scopes).size === scopes.length &&
    scopes.every((scope) => Object.hasOwn(MCP_SCOPES, scope)) &&
    (!scopes.includes("read_private") || scopes.includes("read")) &&
    (!scopes.includes("delete") || scopes.includes("write"));
}

export function configuredOrigin(): string | null {
  try {
    const url = new URL(process.env.PUBLIC_BASE_URL ?? "");
    return (url.protocol === "https:" || isLoopbackHttp(url)) && !url.username && !url.password ? url.origin : null;
  } catch { return null; }
}

function isLoopbackHttp(url: URL) {
  return url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
}

/** No wildcard browser access or plaintext remote credential exchange. */
export function requestAllowed(request: Request) {
  const base = configuredOrigin();
  if (!base) return false;
  const origin = request.headers.get("origin");
  if (origin !== null && origin !== base) return false;
  const url = new URL(base);
  if (isLoopbackHttp(url)) return isLoopbackHttp(new URL(request.url));
  // Next uses the proxy's forwarded protocol in request.url. Terminate TLS at a trusted proxy.
  return new URL(request.url).protocol === "https:";
}

export async function boundedBody(request: Request, limit = 32 * 1024): Promise<string> {
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > limit)) throw new RangeError("body");
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) { void reader.cancel().catch(() => {}); throw new RangeError("body"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks, size).toString("utf8");
}

export const privateHeaders = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
