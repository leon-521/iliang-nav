import Link from "next/link";
import { BookOpen, Code2, KeyRound, Wrench } from "lucide-react";
import { Main, PageHeader } from "@/components/layout/main";
import { buttonVariants } from "@/components/ui/button";
import { configuredOrigin } from "@/lib/mcp/common";

const panel = "min-w-0 space-y-3 rounded-xl border bg-card p-4 sm:p-6";
const codeStyle = "max-w-full overflow-x-auto rounded-lg border bg-muted/40 p-3 text-xs leading-relaxed";

export default function ApiManualPage() {
  const base = configuredOrigin() ?? "https://nav.example.com";
  const initialize = `POST ${base}/api/mcp\nAuthorization: Bearer <TOKEN>\nContent-Type: application/json\nAccept: application/json, text/event-stream\n\n${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "my-client", version: "1.0.0" } } }, null, 2)}`;
  const oauth = `POST ${base}/api/oauth/token\nContent-Type: application/x-www-form-urlencoded\nAuthorization: Basic <BASE64_CLIENT_ID_AND_SECRET>\n\ngrant_type=client_credentials&scope=read`;
  return <Main>
    <PageHeader title="API 手册" description="为外部 AI 客户端和脚本接入本站的 MCP 书签工具。">
      <Link href="/settings?tab=mcp" className={buttonVariants({ variant: "outline" })}><KeyRound aria-hidden />MCP 设置</Link>
    </PageHeader>
    <div className="grid min-w-0 gap-4 xl:grid-cols-2">
      <section className={panel}>
        <h2 className="flex items-center gap-2 font-semibold"><BookOpen className="size-4 text-primary" aria-hidden />开始接入</h2>
        <ol className="list-decimal space-y-2 ps-5 text-sm text-muted-foreground">
          <li>在「设置 → MCP」启用服务并生成最小权限凭据。MCP 默认关闭，管理后台的 Cookie 不能代替凭据。</li>
          <li>客户端选择 Streamable HTTP，服务地址为 <code className="break-all">{base}/api/mcp</code>。{!configuredOrigin() && "这是示例地址，请先配置 PUBLIC_BASE_URL。"}</li>
          <li>远端使用 HTTPS；仅本机回环允许 HTTP。浏览器若携带 Origin，必须与站点配置的公开源相同。不提供 SSE 长连接或动态客户端注册。</li>
        </ol>
      </section>
      <section className={panel}>
        <h2 className="flex items-center gap-2 font-semibold"><KeyRound className="size-4 text-primary" aria-hidden />认证和权限</h2>
        <p className="text-sm text-muted-foreground">可直接使用 <code>Authorization: Bearer &lt;TOKEN&gt;</code>。OAuth 仅支持 Client Credentials，换取短期 <code>access_token</code> 后按同样方式调用；可用 Basic 认证或表单提交客户端 ID 与密钥，不能混用。</p>
        <pre className={codeStyle}><code>{oauth}</code></pre>
        <dl className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
          <div><dt className="font-mono text-foreground">read</dt><dd>读取公开书签与分类</dd></div>
          <div><dt className="font-mono text-foreground">read_private</dt><dd>访问非公开数据，依赖 read</dd></div>
          <div><dt className="font-mono text-foreground">write</dt><dd>创建、修改、隐藏或排序</dd></div>
          <div><dt className="font-mono text-foreground">delete</dt><dd>永久删除，依赖 write；逐条确认</dd></div>
        </dl>
      </section>
      <section className={panel}>
        <h2 className="flex items-center gap-2 font-semibold"><Code2 className="size-4 text-primary" aria-hidden />JSON-RPC 请求</h2>
        <p className="text-sm text-muted-foreground">先调用 <code>initialize</code>，随后发送无 ID 的 <code>notifications/initialized</code>（返回 202）；后续请求可附上协商后的 <code>MCP-Protocol-Version</code>。每次 POST 均需认证。</p>
        <pre className={codeStyle}><code>{initialize}</code></pre>
      </section>
      <section className={panel}>
        <h2 className="flex items-center gap-2 font-semibold"><Wrench className="size-4 text-primary" aria-hidden />发现工具与处理错误</h2>
        <p className="text-sm text-muted-foreground">通过 <code>tools/list</code> 获取当前凭据可用工具及参数，再用 <code>tools/call</code>。以下是读取书签的示例：</p>
        <pre className={codeStyle}><code>{JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "list_bookmarks", arguments: { limit: 20 } } }, null, 2)}</code></pre>
        <ul className="list-disc space-y-1 ps-5 text-sm text-muted-foreground">
          <li>404：MCP 未启用；401：凭据缺失、无效或过期；403：请求源或站点地址配置不符合要求。</li>
          <li>HTTP 200 也可能包含 JSON-RPC <code>error</code> 或工具结果 <code>isError: true</code>，请检查响应正文。</li>
          <li>永久删除需要明确确认 <code>DELETE:&lt;id&gt;</code>，分类只允许删除空分类。</li>
        </ul>
      </section>
    </div>
  </Main>;
}
