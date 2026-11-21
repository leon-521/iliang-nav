import {
  Bookmark,
  Briefcase,
  Coffee,
  Code2,
  Folder,
  Globe,
  Newspaper,
  Palette,
  Server,
  Sparkles,
  Wrench,
  type LucideIcon,
} from "lucide-react";

/**
 * 分类图标。
 *
 * 库里 categories.icon 为空，所以不存图标名，改为按分类名做关键词映射，
 * 让「AI类 / GitHub类 / VPS面板」这类常见命名自动拿到合适图标。
 * 匹配不上就回落到文件夹 —— 不猜。
 */
const RULES: Array<[RegExp, LucideIcon]> = [
  [/ai|人工智能|智能|gpt|llm/i, Sparkles],
  [/github|开发|代码|编程|技术|dev/i, Code2],
  [/设计|灵感|ui|ux|素材|配色/i, Palette],
  [/资讯|新闻|阅读|博客|文章|rss/i, Newspaper],
  [/生活|娱乐|音乐|影视|视频|游戏/i, Coffee],
  [/idc|vps|面板|服务器|云|主机|运维/i, Server],
  [/网站|我的|个人|导航|主页/i, Globe],
  [/效率|办公|文档|笔记|协作|工具/i, Briefcase],
  [/实用|资源|工具|软件/i, Wrench],
];

export function iconForCategory(name: string): LucideIcon {
  for (const [re, Icon] of RULES) {
    if (re.test(name)) return Icon;
  }
  return Folder;
}

export { Bookmark };
