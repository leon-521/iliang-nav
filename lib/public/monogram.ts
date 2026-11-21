/**
 * 分类视觉标记。
 *
 * 库里 categories.icon 目前全为空，所以不虚构图标：
 * 用「名称哈希 → 确定性色相」生成一个字母块，
 * 同一分类在任何页面、任何时间都是同一个颜色。
 */

/** 8 组低饱和色，深浅两套都由 CSS 变量控制明度，这里只给色相 */
const HUES = [14, 32, 48, 96, 168, 205, 248, 292];

export function categoryHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) % 100000;
  }
  return HUES[h % HUES.length];
}

/** 取首个非空字符，中文取首字，英文取首字母大写 */
export function categoryMonogram(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "·";
  const first = [...trimmed][0];
  return /[a-z]/i.test(first) ? first.toUpperCase() : first;
}
