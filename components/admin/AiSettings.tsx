"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { clearAiSettings, loadAiSettings, storeAiSettings, testAiSettings } from "@/lib/ai/actions";

export function AiSettings() {
  const [endpoint, setEndpoint] = useState("");
  const [model, setModel] = useState("");
  const [configured, setConfigured] = useState(false);
  const [ready, setReady] = useState(false);
  const [confirmation, setConfirmation] = useState(false);
  const [pending, run] = useTransition();
  const [status, setStatus] = useState<{ text: string; error?: boolean }>();

  useEffect(() => {
    let active = true;
    loadAiSettings().then((result) => {
      if (!active) return;
      setEndpoint(result.endpoint);
      setModel(result.model);
      setConfigured(result.configured);
      if (result.error) setStatus({ text: result.error, error: true });
      setReady(true);
    }).catch(() => { if (active) setStatus({ text: "无法读取设置，请刷新后重试。", error: true }); });
    return () => { active = false; };
  }, []);

  function perform(operation: () => Promise<void>) {
    setStatus(undefined);
    run(async () => {
      try { await operation(); }
      catch { setStatus({ text: "操作失败，请重新登录或稍后再试。", error: true }); }
    });
  }

  return (
    <div className="w-full min-w-0 space-y-5 lg:w-[86%]">
      <div className="space-y-1.5">
        <p className="text-sm font-medium">自定义 API 供应商</p>
        <p className="text-sm text-muted-foreground">支持公开 HTTPS 的 OpenAI 兼容 Chat Completions API。密钥只写入服务端加密文件，不随站内数据库备份或导出。</p>
      </div>
      <form className="space-y-4" onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        const key = form.elements.namedItem("key");
        if (key instanceof HTMLInputElement) key.value = "";
        perform(async () => {
          const result = await storeAiSettings(data);
          if (!result.ok) { setStatus({ text: result.error ?? "保存失败。", error: true }); return; }
          setEndpoint(result.endpoint ?? "");
          setModel(result.model ?? "");
          setConfigured(true);
          setConfirmation(false);
          setStatus({ text: "供应商设置已保存。保存本身不会发起网络请求。" });
        });
      }}>
        <div className="space-y-2"><Label htmlFor="ai-endpoint">API 地址</Label><Input id="ai-endpoint" name="endpoint" type="url" required maxLength={2048} placeholder="https://api.example.com/v1" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} disabled={!ready || pending} /></div>
        <div className="space-y-2"><Label htmlFor="ai-model">模型 ID</Label><Input id="ai-model" name="model" required maxLength={160} placeholder="填写供应商提供的文本模型 ID" value={model} onChange={(e) => setModel(e.target.value)} disabled={!ready || pending} /></div>
        <div className="space-y-2"><Label htmlFor="ai-key">API 密钥</Label><Input id="ai-key" name="key" type="password" autoComplete="new-password" maxLength={2048} placeholder={configured ? "已配置；留空保留当前密钥" : "输入供应商密钥"} disabled={!ready || pending} /><p className="text-xs text-muted-foreground">首次配置或更换地址时必须输入密钥；已保存的密钥不会回显。</p></div>
        <Button type="submit" disabled={!ready || pending}>{pending ? "处理中…" : "保存供应商"}</Button>
      </form>
      {configured && <div className="space-y-3 border-t pt-4">
        <div className="flex items-start gap-2"><Checkbox id="ai-config-confirm" checked={confirmation} onCheckedChange={(value) => setConfirmation(value === true)} disabled={pending} /><Label className="leading-snug" htmlFor="ai-config-confirm">确认对已保存的供应商执行下方操作</Label></div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={!confirmation || pending} onClick={() => perform(async () => {
            const result = await testAiSettings(confirmation);
            setConfirmation(false);
            setStatus({ text: result.ok ? "测试成功：模型返回了文本响应。" : result.error ?? "测试失败。", error: !result.ok });
          })}>发送测试请求</Button>
          <Button type="button" variant="ghost" disabled={!confirmation || pending} onClick={() => perform(async () => {
            const result = await clearAiSettings(confirmation);
            setConfirmation(false);
            if (result.ok) { setConfigured(false); setEndpoint(""); setModel(""); }
            setStatus({ text: result.ok ? "供应商设置已移除。" : result.error ?? "移除失败。", error: !result.ok });
          })}>移除供应商与密钥</Button>
        </div>
      </div>}
      {status && <p role={status.error ? "alert" : "status"} className={`text-sm ${status.error ? "text-destructive" : "text-muted-foreground"}`}>{status.text}</p>}
      <Link href="/ai-tools" className="text-sm text-primary hover:underline">前往 AI 工具</Link>
    </div>
  );
}
