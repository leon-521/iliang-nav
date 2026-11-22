"use client";

import Link from "next/link";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createMcpCredential, getMcpSettings, removeMcpCredential, toggleMcpSettings } from "@/lib/mcp/actions";
import { MCP_SCOPES, SCOPES, type CredentialKind, type McpScope } from "@/lib/mcp/common";

type Settings = Awaited<ReturnType<typeof getMcpSettings>>;

export function McpSettings() {
  const [data, setData] = useState<Settings>();
  const [pending, run] = useTransition();
  const [kind, setKind] = useState<CredentialKind>("bearer");
  const [scopes, setScopes] = useState<McpScope[]>(["read"]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [created, setCreated] = useState<{ id:string;value:string;kind:CredentialKind }>();
  const [revoking, setRevoking] = useState<string>();
  const [status, setStatus] = useState<{ text:string; error?:boolean }>();
  useEffect(() => {
    let active = true;
    getMcpSettings().then((result) => { if (active) setData(result); }).catch(() => {
      if (active) setStatus({text:"无法读取 MCP 设置。",error:true});
    });
    return () => { active = false; };
  }, []);
  function perform(task: () => Promise<void>) {
    setStatus(undefined);
    run(async () => {
      try { await task(); }
      catch { setStatus({text:"操作失败，请重新登录或稍后重试。",error:true}); }
    });
  }
  const select = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <div className="w-full min-w-0 space-y-6 lg:w-[86%]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">应用原生 MCP · {data?.enabled ? "已启用" : data ? "已停用" : "加载中"}</p>
          <p className="mt-1 text-sm text-muted-foreground">默认关闭。停用会拒绝所有请求并注销已签发的 OAuth 访问令牌；长效凭据可单独撤销。</p>
        </div>
        <Button type="button" variant={data?.enabled ? "outline" : "default"} disabled={pending || !data || (!data.origin && !data.enabled)} onClick={() => perform(async () => {
          if (!data) return;
          const next = !data.enabled;
          const result = await toggleMcpSettings(next);
          if (result.error) { setStatus({text:result.error,error:true}); return; }
          setData(await getMcpSettings());
          setStatus({text:next ? "已启用 MCP。" : "已停用 MCP。"});
        })}>{data?.enabled ? "停用 MCP" : "启用 MCP"}</Button>
      </div>
      <Link href="/api-manual" className="inline-block text-sm font-medium text-primary hover:underline">查看 MCP API 手册</Link>
      {data?.origin ? <dl className="rounded-lg border bg-muted/30 p-3 text-sm">
        <dt className="font-medium">MCP · Streamable HTTP</dt><dd className="mb-3 break-all font-mono text-xs">{data.origin}/api/mcp</dd>
        <dt className="font-medium">OAuth 2.0 Token 端点</dt><dd className="break-all font-mono text-xs">{data.origin}/api/oauth/token</dd>
        <dd className="mt-2 text-xs text-muted-foreground">仅支持 client_credentials；不支持浏览器授权登录。OAuth 访问令牌有效期最多 10 分钟。</dd>
      </dl> : data && <p className="text-sm text-destructive">请部署时配置公开 HTTPS 站点地址，或使用本机 HTTP 地址。</p>}
      {data && <form className="space-y-4 border-t pt-4" onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const values = new FormData(form);
        setCreated(undefined);
        perform(async () => {
          const result = await createMcpCredential({label:values.get("label"),kind,scopes,days:Number(values.get("days")),confirmDelete});
          if (result.error) { setStatus({text:result.error,error:true}); return; }
          if (!result.credential) return;
          setCreated({...result.credential,kind});
          form.reset();setKind("bearer");setScopes(["read"]);setConfirmDelete(false);
          setData(await getMcpSettings());
        });
      }}>
        <h3 className="text-sm font-semibold">生成接入凭据</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5"><Label htmlFor="mcp-label">名称</Label><Input id="mcp-label" name="label" required maxLength={60} placeholder="书签助手" /></div>
          <div className="space-y-1.5"><Label htmlFor="mcp-kind">认证方式</Label><select id="mcp-kind" className={select} value={kind} onChange={(event) => setKind(event.target.value === "oauth" ? "oauth" : "bearer")}><option value="bearer">Bearer 令牌</option><option value="oauth">OAuth 客户端</option></select></div>
          <div className="space-y-1.5"><Label htmlFor="mcp-days">有效天数</Label><Input id="mcp-days" name="days" type="number" min={1} max={365} defaultValue={30} required /></div>
        </div>
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium">权限范围</legend>
          {SCOPES.map((scope) => <div key={scope} className="flex items-center gap-2">
            <Checkbox id={`mcp-scope-${scope}`} checked={scopes.includes(scope)} disabled={pending || (scope === "delete" && !scopes.includes("write")) || (scope === "read_private" && !scopes.includes("read"))} onCheckedChange={(checked) => {
              if (scope === "delete" || scope === "write") setConfirmDelete(false);
              setScopes((previous) => checked === true ? [...previous,scope] : previous.filter((item) => item !== scope && !(scope === "read" && item === "read_private") && !(scope === "write" && item === "delete")));
            }} />
            <Label htmlFor={`mcp-scope-${scope}`} className={scope === "delete" ? "text-destructive" : ""}>{MCP_SCOPES[scope]}</Label>
          </div>)}
        </fieldset>
        {scopes.includes("delete") && <div className="flex items-center gap-2 rounded-lg border border-destructive/40 p-2"><Checkbox id="mcp-confirm-delete" checked={confirmDelete} onCheckedChange={(value) => setConfirmDelete(value === true)} /><Label htmlFor="mcp-confirm-delete" className="leading-snug">确认授予此客户端永久删除权限；仅授予可信客户端。</Label></div>}
        <Button type="submit" disabled={pending || !scopes.length || (scopes.includes("delete") && !confirmDelete)}>生成凭据</Button>
      </form>}
      {created && <section className="space-y-2 rounded-lg border border-primary/40 p-3" aria-label="凭据仅显示一次">
        <p className="text-sm font-medium">请立即复制保存。离开或关闭后不再显示密钥。</p>
        {created.kind === "oauth" && <div><Label htmlFor="mcp-client-id">Client ID</Label><Input id="mcp-client-id" readOnly value={created.id} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} /></div>}
        <Label htmlFor="mcp-created">{created.kind === "oauth" ? "Client Secret" : "Bearer Token"}</Label><Input id="mcp-created" readOnly autoComplete="off" value={created.value} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
        <Button type="button" variant="outline" size="sm" onClick={() => setCreated(undefined)}>已保存，隐藏密钥</Button>
      </section>}
      {data && <section className="space-y-3 border-t pt-4" aria-labelledby="mcp-credentials">
        <h3 id="mcp-credentials" className="text-sm font-semibold">已生成的凭据</h3>
        {!data.credentials.length && <p className="text-sm text-muted-foreground">暂无凭据。</p>}
        <ul className="space-y-2">
          {data.credentials.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
            <div className="min-w-0"><p className="break-all text-sm font-medium">{item.label} · {item.kind === "oauth" ? "OAuth 客户端" : "Bearer"}</p><p className="break-words text-xs text-muted-foreground">{item.scopes.join(" / ")} · {new Date(item.expires*1000).toISOString().slice(0,10)}（UTC）到期</p><p className="break-all font-mono text-xs text-muted-foreground">{item.id}</p></div>
            {revoking === item.id ? <div className="flex gap-2"><Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => setRevoking(undefined)}>取消</Button><Button type="button" variant="destructive" size="sm" disabled={pending} onClick={() => perform(async () => {
              const result = await removeMcpCredential(item.id);
              if (result.error) { setStatus({text:result.error,error:true}); return; }
              if (created?.id === item.id) setCreated(undefined);
              setRevoking(undefined);setData(await getMcpSettings());setStatus({text:"凭据已撤销。"});
            })}>确认撤销</Button></div> : <Button type="button" variant="outline" size="sm" disabled={pending} aria-label={`撤销 ${item.label}`} onClick={() => setRevoking(item.id)}>撤销</Button>}
          </li>)}
        </ul>
      </section>}
      {status && <p role={status.error ? "alert" : "status"} className={`text-sm ${status.error ? "text-destructive" : "text-muted-foreground"}`}>{status.text}</p>}
    </div>
  );
}
