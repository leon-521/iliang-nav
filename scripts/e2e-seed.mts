/**
 * E2E 种子数据。
 *
 * 每次跑测试前重建一个干净的库：迁移 → FTS → 管理员 → 分类 → 书签。
 * 不碰 data/app.db，也不读 .env —— 测试必须能在任何机器上重复出同样的结果。
 *
 * 用 .mts 而不是 .mjs：url_hash 必须用 lib/import/url.ts 的
 * normalizeUrl + hashUrl 真算出来，不能随手编一个字符串 ——
 * 编的话「重复网址」这条用例永远测不到真实去重逻辑。
 *
 * 用法：DATABASE_PATH=/tmp/nav-e2e.db npx tsx scripts/e2e-seed.mts
 */
import Database from "better-sqlite3";
import { hash } from "@node-rs/argon2";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { normalizeUrl, hashUrl } from "../lib/import/url";

const dbPath = process.env.DATABASE_PATH ?? "/tmp/nav-e2e.db";
const sqlite = new Database(dbPath);
sqlite.pragma("foreign_keys = ON");

/** 测试专用账号，只在临时库里存在 */
const E2E_EMAIL = "e2e@local.test";
const E2E_PASSWORD = "E2ePassword123456";

const now = Math.floor(Date.now() / 1000);

/* ---------------- 管理员 ---------------- */

const pwHash = await hash(E2E_PASSWORD, {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
});

sqlite
  .prepare(
    "insert into users (id, email, password_hash, name, session_version, created_at) values (?, ?, ?, ?, 0, ?)",
  )
  .run(randomUUID(), E2E_EMAIL, pwHash, "E2E", now);

/* ---------------- 分类（两层，用于侧栏折叠） ---------------- */

const catTech = randomUUID();
const catFrontend = randomUUID();
const catTools = randomUUID();

const insertCat = sqlite.prepare(
  `insert into categories (id, parent_id, name, slug, icon, sort_order, visibility, created_at)
   values (?, ?, ?, ?, null, ?, 'public', ?)`,
);

insertCat.run(catTech, null, "技术", "jishu-e2e001", 0, now);
insertCat.run(catFrontend, catTech, "前端", "qianduan-e2e002", 0, now);
insertCat.run(catTools, null, "工具", "gongju-e2e003", 1, now);

/*
 * 私有分类：可见性测试用。
 * 这个分类下的书签哪怕自身标了 public，也不该出现在公开页 ——
 * 这正是 visibleWhere 里 `categories.visibility = 'public'` 那一半的作用。
 */
const catSecret = randomUUID();
sqlite
  .prepare(
    `insert into categories (id, parent_id, name, slug, icon, sort_order, visibility, created_at)
     values (?, null, ?, ?, null, 2, 'private', ?)`,
  )
  .run(catSecret, "私密分类", "simi-e2e004", now);

/* ---------------- 书签 ---------------- */

const insertBookmark = sqlite.prepare(
  `insert into bookmarks
     (id, category_id, url, url_hash, title, description, icon_url, icon_source,
      icon_hidden, visibility, effective_visibility, sort_order, click_count,
      is_broken, last_checked_at, created_at, updated_at)
   values (?, ?, ?, ?, ?, ?, ?, ?, 0, null, 'public', ?, 0, 0, ?, ?, ?)`,
);

/** 带显式可见性的插入，给隔离测试用 */
const insertBookmarkWithVis = sqlite.prepare(
  `insert into bookmarks
     (id, category_id, url, url_hash, title, description, icon_url, icon_source,
      icon_hidden, visibility, effective_visibility, sort_order, click_count,
      is_broken, last_checked_at, created_at, updated_at)
   values (?, ?, ?, ?, ?, ?, null, 'none', 0, ?, ?, ?, 0, 0, ?, ?, ?)`,
);

/**
 * 这三条图标和简介都齐全 —— 批量补全测试用它们断言
 * 「没有需要补的」，避免测试去打外网。
 */
const filled: Array<[string, string, string, string, string]> = [
  ["示例站点A", "https://example-a.invalid/", "第一个示例", catTech, "https://example-a.invalid/favicon.png"],
  ["示例站点B", "https://example-b.invalid/", "第二个示例", catFrontend, "https://example-b.invalid/favicon.png"],
  ["示例站点C", "https://example-c.invalid/", "第三个示例", catTools, "https://example-c.invalid/favicon.png"],
];

for (const [i, [title, url, desc, catId, icon]] of filled.entries()) {
  const normalized = normalizeUrl(url);
  if (!normalized) throw new Error(`种子 URL 不合法: ${url}`);
  insertBookmark.run(
    randomUUID(),
    catId,
    normalized,
    hashUrl(normalized),
    title,
    desc,
    icon,
    "fetched",
    i,
    now,
    now,
    now,
  );
}

/**
 * 故意留一条「没图标、没简介」的，给批量补全用。
 *
 * E2E 里 METADATA_DISABLED=1，抓取会失败，所以这条的断言是
 * 「抓不到 1」—— 验证的是批量流程能跑通、失败不炸，
 * 而不是真的抓到了东西（那属于联网测试，不该放进 E2E）。
 */
{
  const url = "https://example-d.invalid/";
  const normalized = normalizeUrl(url);
  if (!normalized) throw new Error(`种子 URL 不合法: ${url}`);
  insertBookmark.run(
    randomUUID(),
    catTools,
    normalized,
    hashUrl(normalized),
    "示例站点D",
    null,
    null,
    "none",
    99,
    now,
    now,
    now,
  );
}

/**
 * 中文子串搜索专用。
 *
 * 「资源」在 FTS5 的 unicode61 分词里落在 token 中间（整条标题是一个 token），
 * 所以它必须靠 LIKE 兜底才搜得到。这条数据就是那个兜底的回归测试 ——
 * 没有它，搜索退化回纯 FTS 时用例照样全绿。
 */
{
  const url = "https://example-e.invalid/";
  const normalized = normalizeUrl(url);
  if (!normalized) throw new Error(`种子 URL 不合法: ${url}`);
  insertBookmark.run(
    randomUUID(),
    catTech,
    normalized,
    hashUrl(normalized),
    "我的资源合集",
    "前端教程与文档",
    null,
    "none",
    50,
    now,
    now,
    now,
  );
}

/**
 * 可见性隔离专用数据。
 *
 * 三条覆盖三种泄漏路径，任何一条漏到公开域都是安全问题：
 *  1. private 书签（自身私有）
 *  2. unlisted 书签（链接可见，但不该出现在首页/搜索/分类页）
 *  3. public 书签挂在 private 分类下（分类拖累书签）
 */

/*
 * 备用链接：给「示例站点A」挂一个镜像地址。
 * 前台卡片上应该多出一个独立入口，且不能是 a 套 a
 * （嵌套的话浏览器会把内层拆出去，点备用还是跳主站）。
 */
sqlite
  .prepare("update bookmarks set alt_url = ? where title = ?")
  .run("https://example-a-mirror.invalid/", "示例站点A");

const visCases: Array<[string, string, string, string, string | null]> = [
  ["私密书签", "https://secret-private.invalid/", "private", "private", null],
  ["链接可见书签", "https://secret-unlisted.invalid/", "unlisted", "unlisted", null],
  ["私有分类里的公开书签", "https://secret-incat.invalid/", "public", "public", catSecret],
];

for (const [i, [title, url, ownVis, effVis, catId]] of visCases.entries()) {
  const normalized = normalizeUrl(url);
  if (!normalized) throw new Error(`种子 URL 不合法: ${url}`);
  insertBookmarkWithVis.run(
    randomUUID(),
    catId,
    normalized,
    hashUrl(normalized),
    title,
    "不应出现在公开域",
    ownVis,
    effVis,
    200 + i,
    now,
    now,
    now,
  );
}

sqlite.close();
console.log(
  `[e2e-seed] ${path.basename(dbPath)}: 1 用户 / 3 分类 / ${filled.length + 2} 书签`,
);
