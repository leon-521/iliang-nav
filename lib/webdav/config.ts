import { z } from "zod";

export const configFields = z.object({
  endpoint: z.string().trim().min(1).max(2048),
  username: z.string().trim().min(1).max(256).regex(/^[^:\p{Cc}]+$/u),
  password: z.string().min(1).max(1024).refine((value) => !/[\p{Cc}]/u.test(value)),
  intervalHours: z.number().int().min(1).max(168),
  enabled: z.boolean(),
});

export class WebDavError extends Error {}

export function collectionUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || /[?#]/.test(value)) throw new Error();
    for (const part of url.pathname.split("/")) {
      if (/[\\/\p{Cc}]/u.test(decodeURIComponent(part))) throw new Error();
    }
  } catch {
    throw new WebDavError("请填写有效的 HTTPS WebDAV 文件夹地址，不要在 URL 中放入凭据、查询参数或片段。");
  }
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/`;
  return url;
}

export const scheduleState = z.object({
  revision: z.string().uuid(),
  lastRun: z.number().int().nonnegative(),
  lastSuccess: z.number().int().nonnegative().nullable(),
  lastFile: z.string().max(100).nullable(),
  result: z.enum(["running", "success", "failed"]),
  error: z.string().max(300).nullable(),
});

export type WebDavConfig = z.infer<typeof configFields> & { revision: string };
export type ScheduleState = z.infer<typeof scheduleState>;
export type DisplayConfig = Omit<WebDavConfig, "password" | "revision"> & { configured: boolean; state: ScheduleState | null };

export function isDue(config: Pick<WebDavConfig, "enabled" | "intervalHours">, state: Pick<ScheduleState, "lastRun"> | null, now: number) {
  return config.enabled && (!state || now - state.lastRun >= config.intervalHours * 3_600_000);
}

export function errorText(e: unknown) {
  return e instanceof WebDavError ? e.message : "备份未完成，请检查本地存储、网络或 WebDAV 配置。";
}
