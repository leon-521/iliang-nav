import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookmarkTags, tags } from "@/lib/db/schema";
import { tagKey } from "./tags";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Only load tags attached to the supplied, already-authorized bookmark IDs. */
export function tagsByBookmark(ids: string[]): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (let offset = 0; offset < ids.length; offset += 500) {
    const rows = db.select({ id: bookmarkTags.bookmarkId, name: tags.name })
      .from(bookmarkTags)
      .innerJoin(tags, eq(tags.id, bookmarkTags.tagId))
      .where(inArray(bookmarkTags.bookmarkId, ids.slice(offset, offset + 500)))
      .orderBy(asc(tags.slug))
      .all();
    for (const { id, name } of rows) {
      const labels = result.get(id);
      if (labels) labels.push(name);
      else result.set(id, [name]);
    }
  }
  return result;
}

export function replaceBookmarkTags(tx: Transaction, bookmarkId: string, labels: string[]) {
  tx.delete(bookmarkTags).where(eq(bookmarkTags.bookmarkId, bookmarkId)).run();
  for (const label of labels) {
    const slug = tagKey(label);
    tx.insert(tags).values({ id: crypto.randomUUID(), name: label, slug }).onConflictDoNothing({ target: tags.slug }).run();
    const tag = tx.select({ id: tags.id }).from(tags).where(eq(tags.slug, slug)).get();
    if (!tag) throw new Error("Tag could not be persisted");
    tx.insert(bookmarkTags).values({ bookmarkId, tagId: tag.id }).run();
  }
}
