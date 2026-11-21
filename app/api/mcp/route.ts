import { postMcp, unavailableMethod } from "@/lib/mcp/rpc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = postMcp;
export const GET = unavailableMethod;
export const DELETE = unavailableMethod;
export const OPTIONS = unavailableMethod;
export const HEAD = unavailableMethod;
