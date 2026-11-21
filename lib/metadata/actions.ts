"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookmarks } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { fetchPageMetadata, fetchIconFallback } from "@/lib/metadata/fetch";
import { localizeIcon } from "@/lib/metadata/icons";

/**
 * 批量补齐图标和简介。
 *
 * 为什么按「小批」暴露给前端循环调用，而不是一次跑完：
 * 抓一个页面要 1~3 秒，一百多条就是几分钟。单个 Server Action
 * 卡在那里，用户既看不到进度，还容易被网关或浏览器超时掐断。
 * 所以这里一次只处理一小撮，前端拿着进度条一圈圈推。
 */

export type RefreshSummary = {
  ok: boolean;
  error?: string;
  /** 本批处理了几条 */
  done: number;
  /** 补上了图标 */
  iconFilled: number;
  /** 补上了简介 */
  descFilled: number;
  /** 抓不到，跳过（不算失败，很多站点直接拒绝抓取） */
  skipped: number;
};

/** 单批上限。前端按这个切片，服务端也兜一道，防止有人直接传一万个 id */
const MAX_BATCH = 12;
/** 同批并发。站点大多扛得住 3~4 个并发，再多容易被反爬挡 */
const CONCURRENCY = 3;

export async function refreshMetadataBatch(
  ids: string[],
): Promise<RefreshSummary> {
  await requireAdmin();

  const list = [...new Set(ids)].slice(0, MAX_BATCH);
  const summary: RefreshSummary = {
    ok: true,
    done: 0,
    iconFilled: 0,
    descFilled: 0,
    skipped: 0,
  };
  if (list.length === 0) return summary;

  let cursor = 0;

  async function worker() {
    while (cursor < list.length) {
      const id = list[cursor++];
      const row = db.select().from(bookmarks).where(eq(bookmarks.id, id)).get();
      if (!row) continue;

      /*
       * 只补空缺，不覆盖已有内容。
       *
       * 图标尤其要小心：iconSource === "manual" 是用户自己挑的，
       * 抓来的 favicon 通常更糊，覆盖掉等于把人的劳动抹了。
       */
      const needIcon = !row.iconUrl && row.iconSource !== "manual";
      const needDesc = !row.description;
      if (!needIcon && !needDesc) {
        summary.done++;
        continue;
      }

      let iconUrl: string | null = null;
      let description: string | null = null;

      try {
        const m = await fetchPageMetadata(row.url);
        iconUrl = m.iconUrl;
        description = m.description;
      } catch {
        /*
         * 抓页面失败（403 / 反爬 / 超时）时退一步只取图标。
         * 这类站点的 HTML 一个字都不给，但图标服务基本都能拿到，
         * 少了这步列表里就是一片灰方块。
         */
        if (needIcon) {
          iconUrl = await fetchIconFallback(row.url);
        }
      }

      const patch: Record<string, unknown> = {};
      if (needIcon && iconUrl) {
        /*
         * 落地到本地再写库 —— 批量补全的意义就是「一次性修好」，
         * 存个远程 URL 等于过几个月又要补一遍。
         */
        const localized = await localizeIcon(iconUrl);
        if (localized) {
          patch.iconUrl = localized;
          patch.iconSource = "fetched";
          summary.iconFilled++;
        }
      }
      if (needDesc && description) {
        patch.description = description.slice(0, 500);
        summary.descFilled++;
      }

      if (Object.keys(patch).length > 0) {
        db.update(bookmarks)
          .set({ ...patch, updatedAt: Math.floor(Date.now() / 1000) })
          .where(eq(bookmarks.id, id))
          .run();
      } else {
        summary.skipped++;
      }

      summary.done++;
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  if (summary.iconFilled > 0 || summary.descFilled > 0) {
    revalidatePath("/");
    revalidatePath("/bookmarks");
    revalidatePath("/dashboard");
  }

  return summary;
}
