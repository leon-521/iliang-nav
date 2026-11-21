import { configuredOrigin, privateHeaders } from "@/lib/mcp/common";
import { mcpEnabled } from "@/lib/mcp/credentials";
import { SCOPES } from "@/lib/mcp/common";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET() {
  const issuer = configuredOrigin();
  if (!issuer || !mcpEnabled()) return new Response(null,{status:404,headers:privateHeaders});
  return Response.json({issuer,token_endpoint:`${issuer}/api/oauth/token`,grant_types_supported:["client_credentials"],response_types_supported:[],token_endpoint_auth_methods_supported:["client_secret_basic","client_secret_post"],scopes_supported:SCOPES},{headers:privateHeaders});
}
