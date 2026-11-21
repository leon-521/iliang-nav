/**
 * 首页问候语与日期。
 *
 * 服务端渲染，时区固定 Asia/Shanghai —— 站点是单人的，
 * 不该因为服务器在 UTC 就把「早上好」显示成「晚上好」。
 */

const TZ = "Asia/Shanghai";

export function greetingFor(date = new Date()): string {
  const hour = hourOf(date);

  if (hour < 5) return "夜深了";
  if (hour < 11) return "早上好";
  if (hour < 13) return "中午好";
  if (hour < 18) return "下午好";
  return "晚上好";
}

function hourOf(date: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      hour12: false,
      timeZone: TZ,
    }).format(date),
  );
}

/**
 * 问候语旁的符号。
 * 设计稿是早上，画了太阳；照抄到晚上就变成「晚上好 ☀」，明显不对。
 */
export function greetingMark(date = new Date()): string {
  const hour = hourOf(date);
  if (hour < 5) return "☾";
  if (hour < 11) return "☀";
  if (hour < 18) return "☀";
  return "☾";
}

/**
 * 「10 月 21 日 · 星期三」
 *
 * 不用 format() 直接输出：zh-CN 的 long 格式会把日期和星期粘成
 * 「10月21日星期三」，没有分隔符，读起来费劲。用 parts 自己拼。
 */
export function formatDate(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
    timeZone: TZ,
  }).formatToParts(date);

  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const month = get("month");
  const day = get("day");
  const weekday = get("weekday");

  return `${month} 月 ${day} 日 · ${weekday}`;
}

/**
 * 「丙午年 · 九月十二」
 * 农历由 Intl 的 chinese 历法给出，不引第三方库。
 * 部分运行环境不支持该历法，此时返回 null，调用方不渲染即可。
 */
export function formatLunar(date = new Date()): string | null {
  try {
    const parts = new Intl.DateTimeFormat("zh-CN-u-ca-chinese", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: TZ,
    }).formatToParts(date);

    const get = (t: string) => parts.find((p) => p.type === t)?.value;

    const yearName = get("yearName");
    const month = get("month");
    const day = get("day");
    if (!yearName || !month || !day) return null;

    // day 是阿拉伯数字，转成汉字更符合中文日历习惯
    const DAYS = [
      "初一", "初二", "初三", "初四", "初五", "初六", "初七", "初八", "初九", "初十",
      "十一", "十二", "十三", "十四", "十五", "十六", "十七", "十八", "十九", "二十",
      "廿一", "廿二", "廿三", "廿四", "廿五", "廿六", "廿七", "廿八", "廿九", "三十",
    ];
    const n = Number(day);
    const dayText = Number.isFinite(n) && n >= 1 && n <= 30 ? DAYS[n - 1] : day;

    return `${yearName}年 · ${month}${dayText}`;
  } catch {
    return null;
  }
}
