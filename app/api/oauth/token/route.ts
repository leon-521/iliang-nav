import { boundedBody, configuredOrigin, privateHeaders, requestAllowed } from "@/lib/mcp/common";
import { exchangeClient, mcpEnabled } from "@/lib/mcp/credentials";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { ...privateHeaders, Pragma: "no-cache" };
function fail(error: string, status = 400) {
  return Response.json({ error }, { status, headers: status === 401 ? { ...headers, "WWW-Authenticate": 'Basic realm="iliang-nav"' } : headers });
}
function basic(value: string): [string, string] | null {
  const encoded = /^Basic ([A-Za-z0-9+/]+={0,2})$/i.exec(value)?.[1];
  if (!encoded || encoded.length > 1024) return null;
  const pair = Buffer.from(encoded,"base64").toString("utf8");
  const colon = pair.indexOf(":");
  if (colon < 1) return null;
  try {
    const decode = (str: string) => decodeURIComponent(str.replace(/\+/g," "));
    return [decode(pair.slice(0,colon)),decode(pair.slice(colon+1))];
  } catch { return null; }
}
export async function POST(request: Request) {
  if (!requestAllowed(request)) return fail("invalid_request",403);
  if (!mcpEnabled()) return fail("temporarily_unavailable",404);
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/x-www-form-urlencoded") return fail("invalid_request",415);
  let form: URLSearchParams;
  try { form = new URLSearchParams(await boundedBody(request,8192)); }
  catch (e) { return fail("invalid_request",e instanceof RangeError ? 413 : 400); }
  const unique = ["grant_type","scope","resource","client_id","client_secret"];
  if (unique.some((key) => form.getAll(key).length > 1) || !form.has("grant_type")) return fail("invalid_request");
  if (form.get("grant_type") !== "client_credentials") return fail("unsupported_grant_type");
  if (form.has("resource") && form.get("resource") !== `${configuredOrigin()}/api/mcp`) return fail("invalid_target");
  const auth = request.headers.get("authorization");
  if (auth && (form.has("client_id") || form.has("client_secret"))) return fail("invalid_request");
  const [id, secret] = auth ? basic(auth) ?? ["", ""] : [form.get("client_id") ?? "",form.get("client_secret") ?? ""];
  if (!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(id) || !/^mcp_cs_[A-Za-z0-9_-]{43}$/.test(secret)) return fail("invalid_client",401);
  const result = exchangeClient(id,secret,form.get("scope"));
  if (result.error) return fail(result.error,result.error === "invalid_client" ? 401 : result.error === "temporarily_unavailable" ? 429 : 400);
  return Response.json(result,{headers});
}
