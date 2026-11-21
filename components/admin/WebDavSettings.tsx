"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { backupToWebDavNow, clearWebDavSettings, getWebDavSettings, saveWebDavSettings } from "@/lib/webdav/actions";
import type { DisplayConfig } from "@/lib/webdav/config";

const empty: DisplayConfig = { endpoint: "", username: "", intervalHours: 24, enabled: false, configured: false, state: null };

export function WebDavSettings() {
  const [cfg, setCfg] = useState<DisplayConfig>();
  const [schedulerAvailable, setSchedulerAvailable] = useState(true);
  const [endpoint, setEndpoint] = useState("");
  const [username, setUsername] = useState("");
  const [hours, setHours] = useState("24");
  const [enabled, setEnabled] = useState(false);
  const [scheduleConsent, setScheduleConsent] = useState(false);
  const [command, setCommand] = useState<"upload" | "clear" | null>(null);
  const [notice, setNotice] = useState<{ text: string; error?: boolean }>();
  const [pending, run] = useTransition();

  function setFormFromConfig(data: DisplayConfig, scheduler: boolean) {
    setCfg(data);
    setSchedulerAvailable(scheduler);
    setEndpoint(data.endpoint);
    setUsername(data.username);
    setHours(String(data.intervalHours));
    setEnabled(data.enabled);
    setScheduleConsent(false);
  }

  useEffect(() => {
    let alive = true;
    getWebDavSettings().then((res) => {
      if (!alive) return;
      if (res.ok) setFormFromConfig(res.value, res.schedulerAvailable);
      else { setCfg(empty); setNotice({ text: res.error, error: true }); }
    }).catch(() => {
      if (!alive) return;
      setCfg(empty);
      setNotice({ text: "读取备份设置失败，请刷新后重试。", error: true });
    });
    return () => { alive = false; };
  }, []);

  async function sync(resetForm = false) {
    const res = await getWebDavSettings();
    if (!res.ok) { setNotice({ text: res.error, error: true }); return; }
    if (resetForm) setFormFromConfig(res.value, res.schedulerAvailable);
    else setCfg(res.value);
  }

  function perform(action: () => Promise<void>) {
    setNotice(undefined);
    run(async () => {
      try { await action(); }
      catch { setNotice({ text: "操作失败，请确认仍处于登录状态后重试。", error: true }); }
    });
  }

  if (!cfg) return <div aria-label="正在读取 WebDAV 配置" aria-busy="true" className="space-y-3"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-3/4" /></div>;
  const state = cfg.state;
  const hasChanges = endpoint !== cfg.endpoint || username !== cfg.username || enabled !== cfg.enabled || hours !== String(cfg.intervalHours);

  return (
    <div className="w-full min-w-0 space-y-6 lg:w-[86%]">
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">远程数据库快照</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">将 SQLite 一致快照上传到已存在的 WebDAV 文件夹。快照包含私有书签与站点数据，但不包含站点外的图标文件或服务端配置文件。上传文件未另行加密，请使用受信任的 HTTPS 服务和仅限此目录的应用密钥。</p>
      </div>
      <form className="space-y-4" onSubmit={(event) => {
        event.preventDefault();
        setCommand(null);
        const form = event.currentTarget;
        const data = new FormData(form);
        if (enabled) data.set("enabled", "on");
        if (scheduleConsent) data.set("authorizeSchedule", "on");
        perform(async () => {
          const res = await saveWebDavSettings(data);
          if (!res.ok) { setNotice({ text: res.error ?? "保存失败。", error: true }); return; }
          const input = form.elements.namedItem("password");
          if (input instanceof HTMLInputElement) input.value = "";
          setNotice({ text: "WebDAV 设置已保存。保存操作不会立即发起上传。" });
          await sync(true);
        });
      }}>
        <div className="space-y-2"><Label htmlFor="webdav-endpoint">WebDAV 文件夹地址</Label><Input id="webdav-endpoint" name="endpoint" type="url" value={endpoint} onChange={(e) => { setEndpoint(e.target.value); setScheduleConsent(false); }} placeholder="https://dav.example.com/backups/" maxLength={2048} required disabled={pending} /></div>
        <div className="space-y-2"><Label htmlFor="webdav-username">WebDAV 账号</Label><Input id="webdav-username" name="username" value={username} onChange={(e) => { setUsername(e.target.value); setScheduleConsent(false); }} maxLength={256} autoComplete="off" required disabled={pending} /></div>
        <div className="space-y-2"><Label htmlFor="webdav-password">WebDAV 密钥</Label><Input id="webdav-password" name="password" type="password" autoComplete="new-password" maxLength={1024} placeholder={cfg.configured ? "留空保留当前账号的密钥" : "填写应用密码或访问密钥"} required={!cfg.configured} disabled={pending} /><p className="text-xs text-muted-foreground">首次保存或更换地址、账号时必须重新填写。密钥加密存放在数据库之外，不会回显。</p></div>
        <div className="space-y-2"><Label htmlFor="webdav-interval">备份间隔（小时）</Label><Input id="webdav-interval" className="max-w-36" name="intervalHours" type="number" min={1} max={168} step={1} value={hours} onChange={(e) => { setHours(e.target.value); setScheduleConsent(false); }} required disabled={pending} /></div>
        <div className="flex items-center gap-2"><Checkbox id="webdav-enabled" checked={enabled} onCheckedChange={(value) => { setEnabled(value === true); setScheduleConsent(false); }} disabled={pending || (!schedulerAvailable && !enabled)} /><Label htmlFor="webdav-enabled">启用定时备份</Label></div>
        {enabled && <div className="flex items-start gap-2"><Checkbox id="webdav-schedule-consent" checked={scheduleConsent} onCheckedChange={(value) => setScheduleConsent(value === true)} disabled={pending} /><Label htmlFor="webdav-schedule-consent" className="leading-snug">我授权站点按设定间隔向此地址上传数据库快照。</Label></div>}
        {!schedulerAvailable && <p className="text-sm text-muted-foreground">服务端已禁用定时任务；手动备份仍可使用。</p>}
        <p className="text-xs leading-relaxed text-muted-foreground">首次启用后下一次调度检查即可备份；以后按上一次尝试的时间计算间隔。服务离线期间不会补跑多次。远端历史备份由你自行管理。</p>
        <Button type="submit" disabled={pending || (enabled && (!scheduleConsent || !schedulerAvailable))}>保存 WebDAV 设置</Button>
      </form>
      <section aria-label="备份状态" className="space-y-3 rounded-lg border p-4 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">备份状态</h3><Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => perform(() => sync())}>刷新状态</Button></div>
        {state ? <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-muted-foreground">
          <dt>上次尝试</dt><dd>{new Date(state.lastRun).toLocaleString()}</dd>
          <dt>上次成功</dt><dd>{state.lastSuccess !== null ? new Date(state.lastSuccess).toLocaleString() : "暂无"}</dd>
          <dt>结果</dt><dd>{state.result === "success" ? "成功" : state.result === "running" ? "进行中" : state.error ?? "失败"}</dd>
          {state.lastFile && <><dt>远端文件</dt><dd className="break-all">{state.lastFile}</dd></>}
        </dl> : <p className="text-muted-foreground">暂无运行记录。</p>}
        {cfg.configured && !command && <Button type="button" variant="outline" disabled={pending || hasChanges} onClick={() => setCommand("upload")}>立即备份</Button>}
        {!command && <Button type="button" variant="ghost" disabled={pending} onClick={() => setCommand("clear")}>移除远程设置</Button>}
        {command && <div className="space-y-2 border-t pt-3">
          <p>{command === "upload" ? "确认将当前数据库快照上传到已保存的 WebDAV 目录？" : "确认删除远程配置并停止定时任务？不会删除 WebDAV 上的备份。"}</p>
          <div className="flex flex-wrap gap-2"><Button type="button" disabled={pending || (command === "upload" && hasChanges)} onClick={() => {
            perform(async () => {
              const result = command === "upload" ? await backupToWebDavNow(true) : await clearWebDavSettings(true);
              setCommand(null);
              setNotice(result.ok ? { text: command === "upload" ? "数据库快照已上传。" : "已移除 WebDAV 设置。" } : { text: result.error ?? "操作失败。", error: true });
              await sync(command === "clear" && result.ok);
            });
          }}>{command === "upload" ? "确认上传快照" : "确认移除设置"}</Button><Button type="button" variant="ghost" disabled={pending} onClick={() => setCommand(null)}>取消</Button></div>
        </div>}
      </section>
      {notice && <p role={notice.error ? "alert" : "status"} className={`text-sm ${notice.error ? "text-destructive" : "text-muted-foreground"}`}>{notice.text}</p>}
    </div>
  );
}
