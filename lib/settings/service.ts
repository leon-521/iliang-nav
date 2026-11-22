import { parseWeatherLocation, type WeatherLocation } from "@/lib/weather";
import { inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";

export type SiteSettings = {
  siteName: string;
  siteTagline: string;
  footerText: string;
  weather: WeatherLocation | null;
  /** 首页问候语里的称呼，如「设计师」「林同学」 */
  ownerName: string;
  showIcons: boolean;
  /**
   * 常用工具的展示清单（书签 id，按顺序）。
   * 未配置时才回退到点击最多的前 8 个。
   */
  quickToolIds: string[];
  /** A manually emptied list is distinct from automatic popular shortcuts. */
  quickToolsManual: boolean;
  /** 重置密码邮件的主题/正文模板，空表示用内置默认 */
  mailSubject: string;
  mailText: string;
  mailHtml: string;
};

const DEFAULTS: SiteSettings = {
  siteName: "iliang nav",
  siteTagline: "我的书签导航",
  footerText: "",
  weather: null,
  ownerName: "",
  showIcons: true,
  quickToolIds: [],
  quickToolsManual: false,
  mailSubject: "",
  mailText: "",
  mailHtml: "",
};

const KEYS = [
  "site_name",
  "site_tagline",
  "footer_text",
  "weather_name",
  "weather_latitude",
  "weather_longitude",
  "owner_name",
  "show_icons",
  "quick_tool_ids",
  "mail_subject",
  "mail_text",
  "mail_html",
] as const;

export function getSettings(): SiteSettings {
  const rows = db
    .select()
    .from(settings)
    .where(inArray(settings.key, [...KEYS]))
    .all();

  const map = new Map(rows.map((r) => [r.key, r.value]));
  const rawQuickTools = map.get("quick_tool_ids");
  const quickToolIds = rawQuickTools === "[]" ? [] : parseIds(rawQuickTools);

  return {
    siteName: map.get("site_name") ?? DEFAULTS.siteName,
    siteTagline: map.get("site_tagline") ?? DEFAULTS.siteTagline,
    footerText: map.get("footer_text") ?? DEFAULTS.footerText,
    weather: parseWeatherLocation(map.get("weather_name") ?? "", map.get("weather_latitude") ?? "", map.get("weather_longitude") ?? ""),
    ownerName: map.get("owner_name") ?? DEFAULTS.ownerName,
    showIcons: (map.get("show_icons") ?? "1") === "1",
    quickToolIds,
    quickToolsManual: rawQuickTools === "[]" || quickToolIds.length > 0,
    mailSubject: map.get("mail_subject") ?? DEFAULTS.mailSubject,
    mailText: map.get("mail_text") ?? DEFAULTS.mailText,
    mailHtml: map.get("mail_html") ?? DEFAULTS.mailHtml,
  };
}

/**
 * 存的是逗号分隔的 id 串。
 * 用 JSON 也行，但这里只有一维字符串数组，逗号分隔更好读、也方便手改库。
 */
function parseIds(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function setSetting(key: string, value: string) {
  db.insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })
    .run();
}
