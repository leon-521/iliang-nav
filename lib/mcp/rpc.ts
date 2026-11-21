import { authenticateBearer, mcpEnabled } from "./credentials";
import { boundedBody, configuredOrigin, privateHeaders, requestAllowed } from "./common";
import { callTool, listTools } from "./tools";

const versions = ["2025-11-25", "2025-06-18", "2025-03-26"];
const rpc = (id: unknown, result: unknown) => Response.json({ jsonrpc:"2.0", id, result }, { headers:privateHeaders });
const error = (id: unknown, code: number, message: string, status = 200) => Response.json({jsonrpc:"2.0",id,error:{code,message}}, {status,headers:privateHeaders});
function http(status: number, extra = {}) { return new Response(null, {status,headers:{...privateHeaders,...extra}}); }
function authError() {
  const base = configuredOrigin();
  return http(401,{ "WWW-Authenticate": `Bearer realm="iliang-nav"${base ? `, resource_metadata="${base}/.well-known/oauth-protected-resource/api/mcp"` : ""}` });
}
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const mediaType = (v: string | null) => v?.split(";")[0].trim().toLowerCase();

export function unavailableMethod(request: Request) {
  if (!requestAllowed(request)) return http(403);
  if (!mcpEnabled()) return http(404);
  return http(405, {Allow:"POST"}); // Stateless JSON transport, no SSE/session teardown.
}
export async function postMcp(request: Request) {
  if (!requestAllowed(request)) return http(403);
  if (!mcpEnabled()) return http(404);
  const authorization = request.headers.get("authorization");
  if (!authenticateBearer(authorization)) return authError();
  if (mediaType(request.headers.get("content-type")) !== "application/json") return http(415);
  const accept = request.headers.get("accept");
  if (accept && !accept.split(",").some((item) => ["application/json", "application/*", "*/*"].includes(mediaType(item) ?? ""))) return http(406);
  const protocol = request.headers.get("mcp-protocol-version");
  if (protocol && !versions.includes(protocol)) return http(400);
  let data: unknown;
  try { data = JSON.parse(await boundedBody(request)); }
  catch (e) { return e instanceof RangeError ? http(413) : error(null,-32700,"Parse error",400); }
  // Recheck after reading the body so a slow request cannot act after revocation.
  const principal = authenticateBearer(authorization);
  if (!principal) return authError();
  if (!record(data) || data.jsonrpc !== "2.0" || typeof data.method !== "string") return error(null,-32600,"Invalid Request",400);
  const {id, method, params} = data;
  if (id === undefined && method.startsWith("notifications/")) return http(202);
  if (typeof id !== "string" && (typeof id !== "number" || !Number.isSafeInteger(id))) return error(null,-32600,"Invalid Request",400);
  if (params !== undefined && !record(params)) return error(id,-32602,"Invalid params");
  switch (method) {
    case "initialize": {
      if (typeof params?.protocolVersion !== "string" || !record(params.capabilities) || !record(params.clientInfo) || typeof params.clientInfo.name !== "string" || typeof params.clientInfo.version !== "string") return error(id,-32602,"Invalid initialize params");
      const requested = params.protocolVersion;
      return rpc(id,{ protocolVersion:versions.includes(requested) ? requested : versions[0],capabilities:{tools:{}},serverInfo:{name:"iliang-nav",version:"1.0.0"} });
    }
    case "ping": return rpc(id,{});
    case "tools/list": return params?.cursor ? error(id,-32602,"Invalid cursor") : rpc(id,{tools:listTools(principal)});
    case "tools/call": {
      if (typeof params?.name !== "string" || (params.arguments !== undefined && !record(params.arguments))) return error(id,-32602,"Invalid tool call params");
      return rpc(id,callTool(params.name,params.arguments,principal));
    }
    default: return error(id,-32601,"Method not found");
  }
}
