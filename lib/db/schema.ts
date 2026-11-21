import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/* ------------------------------------------------------------------ */
/* 单用户：users 只有一行（Auth.js adapter 兼容保留）                    */
/* ------------------------------------------------------------------ */

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  name: text("name"),
  image: text("image"),
  /** 改密码 / 退出所有设备时 +1，旧会话立即失效 */
  sessionVersion: integer("session_version").notNull().default(0),
  createdAt: integer("created_at").notNull().default(sql`(unixepoch())`),
});

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at").notNull(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/* ------------------------------------------------------------------ */
/* 找回密码                                                             */
/* ------------------------------------------------------------------ */

/**
 * 一次性重置令牌。
 *
 * 只存 sha256(token)，不存明文：库文件泄露（备份、误传到仓库）时，
 * 攻击者拿到的是一堆哈希，没法直接用来改密码。
 *
 * usedAt 而不是直接删行：留着能看出「这个令牌什么时候被用过」，
 * 排查异常登录时有用。
 */
export const passwordResets = sqliteTable(
  "password_resets",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: integer("expires_at").notNull(),
    usedAt: integer("used_at"),
    /** 申请时的来源 IP，便于发现异常 */
    ip: text("ip"),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch())`),
  },
  (t) => [
    uniqueIndex("password_resets_token_idx").on(t.tokenHash),
    index("password_resets_user_idx").on(t.userId, t.createdAt),
  ],
);

/* ------------------------------------------------------------------ */
/* 站点配置（key-value，避免每加一个开关就迁移）                         */
/* ------------------------------------------------------------------ */

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

/* ------------------------------------------------------------------ */
/* 分类 / 书签 / 标签                                                   */
/* ------------------------------------------------------------------ */

export const categories = sqliteTable(
  "categories",
  {
    id: text("id").primaryKey(),
    parentId: text("parent_id"),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    icon: text("icon"),
    sortOrder: integer("sort_order").notNull().default(0),
    /** private | unlisted | public —— 分类级默认值 */
    visibility: text("visibility").notNull().default("public"),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch())`),
  },
  (t) => [
    uniqueIndex("categories_slug_idx").on(t.slug),
    index("categories_parent_sort_idx").on(t.parentId, t.sortOrder),
  ],
);

export const bookmarks = sqliteTable(
  "bookmarks",
  {
    id: text("id").primaryKey(),
    categoryId: text("category_id").references(() => categories.id, { onDelete: "set null" }),
    url: text("url").notNull(),
    /** 规范化后的 URL，用于去重 */
    urlHash: text("url_hash").notNull(),
    /**
     * 备用链接。主站挂了 / 被墙 / 换域名时用。
     * 不参与去重（同一条书签的两个入口是同一条），也不参与搜索排序。
     */
    altUrl: text("alt_url"),
    title: text("title").notNull(),
    description: text("description"),
    /** 图标三级回退：manual > fetched > null(首字母) */
    iconUrl: text("icon_url"),
    iconSource: text("icon_source").notNull().default("none"), // manual | fetched | none
    iconHidden: integer("icon_hidden", { mode: "boolean" }).notNull().default(false),
    /** 书签自身可见性；NULL 表示继承分类 */
    visibility: text("visibility"),
    /** 写时展开，公开域只查这一列 */
    effectiveVisibility: text("effective_visibility").notNull().default("public"),
    sortOrder: integer("sort_order").notNull().default(0),
    clickCount: integer("click_count").notNull().default(0),
    isBroken: integer("is_broken", { mode: "boolean" }).notNull().default(false),
    lastCheckedAt: integer("last_checked_at"),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch())`),
    updatedAt: integer("updated_at").notNull().default(sql`(unixepoch())`),
  },
  (t) => [
    uniqueIndex("bookmarks_url_hash_idx").on(t.urlHash),
    index("bookmarks_visibility_cat_sort_idx").on(t.effectiveVisibility, t.categoryId, t.sortOrder),
  ],
);

export const tags = sqliteTable(
  "tags",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
  },
  (t) => [uniqueIndex("tags_slug_idx").on(t.slug)],
);

export const bookmarkTags = sqliteTable(
  "bookmark_tags",
  {
    bookmarkId: text("bookmark_id")
      .notNull()
      .references(() => bookmarks.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.bookmarkId, t.tagId] }),
    index("bookmark_tags_tag_idx").on(t.tagId),
  ],
);

/* ------------------------------------------------------------------ */
/* 分享 / 导入 / 统计                                                   */
/* ------------------------------------------------------------------ */

export const shareLinks = sqliteTable(
  "share_links",
  {
    id: text("id").primaryKey(),
    targetType: text("target_type").notNull(), // bookmark | category
    targetId: text("target_id").notNull(),
    token: text("token").notNull(),
    expiresAt: integer("expires_at"),
    passwordHash: text("password_hash"),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch())`),
  },
  (t) => [uniqueIndex("share_links_token_idx").on(t.token)],
);

export const importJobs = sqliteTable("import_jobs", {
  id: text("id").primaryKey(),
  status: text("status").notNull().default("pending"), // pending|parsing|importing|done|failed
  total: integer("total").notNull().default(0),
  processed: integer("processed").notNull().default(0),
  created: integer("created").notNull().default(0),
  skipped: integer("skipped").notNull().default(0),
  errorFile: text("error_file"),
  message: text("message"),
  createdAt: integer("created_at").notNull().default(sql`(unixepoch())`),
  finishedAt: integer("finished_at"),
});

export const clicks = sqliteTable(
  "clicks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    bookmarkId: text("bookmark_id").notNull(),
    referer: text("referer"),
    ipHash: text("ip_hash"),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch())`),
  },
  (t) => [index("clicks_bookmark_idx").on(t.bookmarkId, t.createdAt)],
);

export type Category = typeof categories.$inferSelect;
export type Bookmark = typeof bookmarks.$inferSelect;
export type Tag = typeof tags.$inferSelect;
export type ImportJob = typeof importJobs.$inferSelect;
export type PasswordReset = typeof passwordResets.$inferSelect;
