"use client";

import * as React from "react";
import { CheckCircle2, Send, TriangleAlert } from "lucide-react";
import {
  saveMailSettings,
  sendTestMail,
  type SettingsState,
} from "@/lib/settings/actions";
import type { MailDisplay } from "@/lib/mail/config";
import type { SiteSettings } from "@/lib/settings/service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";

function Feedback({ state }: { state: SettingsState }) {
  if (!state) return null;
  if (state.error)
    return (
      <p className="flex items-start gap-1.5 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" />
        {state.error}
      </p>
    );
  if (state.ok)
    return (
      <p className="flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="size-4" />
        已保存
      </p>
    );
  return null;
}

const VARS = [
  { key: "{{siteName}}", desc: "站点名称" },
  { key: "{{link}}", desc: "重置链接（含令牌）" },
  { key: "{{email}}", desc: "收件人邮箱" },
  { key: "{{ttlMinutes}}", desc: "有效期分钟" },
];

export function MailSettingsForm({
  mail,
  template,
}: {
  mail: MailDisplay;
  template: Pick<SiteSettings, "mailSubject" | "mailText" | "mailHtml">;
}) {
  const [state, setState] = React.useState<SettingsState>(null);
  const [pending, start] = React.useTransition();
  const formRef = React.useRef<HTMLFormElement>(null);

  const [testState, setTestState] = React.useState<SettingsState>(null);
  const [testPending, startTest] = React.useTransition();

  return (
    <div className="space-y-5">
      <form
        ref={formRef}
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          start(async () => setState(await saveMailSettings(null, fd)));
        }}
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
            <div className="space-y-2">
              <Label htmlFor="smtpHost">SMTP 服务器</Label>
              <Input
                id="smtpHost"
                name="smtpHost"
                defaultValue={mail.host}
                placeholder="smtp.qq.com"
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                只填主机名，不要带 smtp:// 或 https://
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="smtpPort">端口</Label>
              <Input
                id="smtpPort"
                name="smtpPort"
                type="number"
                inputMode="numeric"
                min={1}
                max={65535}
                defaultValue={mail.port}
                placeholder="465"
              />
              <p className="text-xs text-muted-foreground">465 走 SSL</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="smtpUser">登录账号</Label>
            <Input
              id="smtpUser"
              name="smtpUser"
              defaultValue={mail.user}
              placeholder="nav@example.com"
              autoComplete="username"
            />
            <p className="text-xs text-muted-foreground">通常是完整邮箱地址</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="smtpPass">密码 / 授权码</Label>
            <Input
              id="smtpPass"
              name="smtpPass"
              type="password"
              autoComplete="new-password"
              placeholder={
                mail.hasPassword
                  ? mail.passwordFromEnv
                    ? "已由环境变量 SMTP_PASS 提供，留空则沿用"
                    : "已保存，留空则不改"
                  : "填邮箱的授权码，不是登录密码"
              }
            />
            <p className="text-xs text-muted-foreground">
              QQ / 163 邮箱要用「授权码」。保存后加密存在数据库里，页面不会再显示。
              {mail.hasPassword ? "留空表示不修改现有密码。" : ""}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="smtpFrom">发件人</Label>
            <Input
              id="smtpFrom"
              name="smtpFrom"
              defaultValue={mail.from}
              placeholder="iliang nav <no-reply@example.com>"
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              留空则用登录账号。带中文名写成「站点名 &lt;地址&gt;」。
            </p>
          </div>

          <Separator />

          <div className="space-y-1">
            <p className="text-sm font-medium">邮件模板</p>
            <p className="text-xs text-muted-foreground">
              留空用内置默认模板。可用占位符：
              {VARS.map((v) => (
                <code
                  key={v.key}
                  className="mx-0.5 rounded bg-secondary px-1 py-0.5 font-mono text-[11px]"
                  title={v.desc}
                >
                  {v.key}
                </code>
              ))}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="mailSubject">主题</Label>
            <Input
              id="mailSubject"
              name="mailSubject"
              defaultValue={template.mailSubject}
              placeholder="重置 {{siteName}} 的登录密码"
              maxLength={120}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="mailText">纯文本正文</Label>
            <Textarea
              id="mailText"
              name="mailText"
              defaultValue={template.mailText}
              rows={8}
              placeholder="留空使用默认模板"
              className="font-mono text-[12.5px] leading-relaxed"
            />
            <p className="text-xs text-muted-foreground">
              不支持 HTML 的邮件客户端（以及部分垃圾邮件过滤器）看的是这一份。
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="mailHtml">HTML 正文</Label>
            <Textarea
              id="mailHtml"
              name="mailHtml"
              defaultValue={template.mailHtml}
              rows={12}
              placeholder="留空使用默认模板"
              className="font-mono text-[12.5px] leading-relaxed"
            />
          </div>

          <Feedback state={state} />
        </div>

        <div className="mt-4">
          <Button type="submit" disabled={pending}>
            {pending ? "保存中…" : "保存邮件设置"}
          </Button>
        </div>
      </form>

      <div className="border-t pt-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            startTest(async () => setTestState(await sendTestMail(null, fd)));
          }}
          className="space-y-3"
        >
          <div>
            <p className="text-sm font-medium">测试发信</p>
            <p className="text-xs text-muted-foreground">
              先保存配置，再发一封测试邮件确认能连上。失败了页面上只给一句人话，详细报错在容器日志里。
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              name="testTo"
              type="email"
              placeholder="收件邮箱，如 admin@example.com"
              className="sm:max-w-xs"
              autoComplete="off"
            />
            <Button type="submit" variant="outline" disabled={testPending}>
              <Send className="size-4" />
              {testPending ? "发送中…" : "发送测试邮件"}
            </Button>
          </div>
          <Feedback state={testState} />
        </form>
      </div>
    </div>
  );
}
