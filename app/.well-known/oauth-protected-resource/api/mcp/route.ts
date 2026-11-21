import { configuredOrigin, privateHeaders, SCOPES } from "@/lib/mcp/common";
import { mcpEnabled } from "@/lib/mcp/credentials";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET() {
  const issuer = configuredOrigin();
  if (!issuer || !mcpEnabled()) return new Response(null,{status:404,headers:privateHeaders});
  return Response.json({resource:`${issuer}/api/mcp`,authorization_servers:[issuer],scopes_supported:SCOPES,bearer_methods_supported:["header"]},{headers:privateHeaders});
}
