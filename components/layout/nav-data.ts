import {
  Bookmark,
  FolderTree,
  LayoutDashboard,
  Settings,
  Sparkles,
  Upload,
} from "lucide-react";

export type NavLink = {
  title: string;
  url: string;
  icon?: React.ElementType;
  badge?: string;
};

export type NavGroupData = {
  title: string;
  items: NavLink[];
};

export const navGroups: NavGroupData[] = [
  {
    title: "总览",
    items: [
      // 前后台同域后 "/" 是公开首页，后台概览在 /dashboard。
      // 这里写错会变成「点概览跳去了前台」，看起来像被踢出登录。
      { title: "概览", url: "/dashboard", icon: LayoutDashboard },
    ],
  },
  {
    title: "整理",
    items: [
      { title: "书签", url: "/bookmarks", icon: Bookmark },
      { title: "分类", url: "/categories", icon: FolderTree },
      { title: "导入", url: "/import", icon: Upload },
      { title: "AI 工具", url: "/ai-tools", icon: Sparkles },
    ],
  },
  {
    title: "系统",
    items: [{ title: "设置", url: "/settings", icon: Settings }],
  },
];
