"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { articleReads, readerState, savedArticles } from "@/db/schema";

/**
 * Reader state actions.
 *
 * Single-reader: the app sits behind one password, so none of these take a
 * user id. See the schema note on `article_reads` if that ever changes.
 */

/**
 * Record that an article was opened.
 *
 * Called from a click handler that does *not* await it — the browser is
 * already navigating to the publisher, and read state must never delay that.
 * Idempotent, so a double-click is harmless.
 */
export async function markRead(articleId: string): Promise<void> {
  await db.insert(articleReads).values({ articleId }).onConflictDoNothing();
  revalidatePath("/");
}

/** Sweep everything currently unread, for when you skim without clicking. */
export async function markAllRead(): Promise<void> {
  await db.execute(sql`
    insert into ${articleReads} (article_id)
    select id from articles
    on conflict (article_id) do nothing
  `);
  revalidatePath("/");
}

export async function markUnread(articleId: string): Promise<void> {
  await db.delete(articleReads).where(eq(articleReads.articleId, articleId));
  revalidatePath("/");
}

/** Star / unstar. Returns the new state so the caller can reflect it. */
export async function toggleSaved(articleId: string): Promise<boolean> {
  const existing = await db
    .select({ articleId: savedArticles.articleId })
    .from(savedArticles)
    .where(eq(savedArticles.articleId, articleId))
    .limit(1);

  if (existing.length > 0) {
    await db.delete(savedArticles).where(eq(savedArticles.articleId, articleId));
    revalidatePath("/");
    revalidatePath("/saved");
    return false;
  }

  await db.insert(savedArticles).values({ articleId }).onConflictDoNothing();
  revalidatePath("/");
  revalidatePath("/saved");
  return true;
}

/**
 * Move the "new since your last visit" watermark to now.
 *
 * Called explicitly rather than on every render: a page load that silently
 * reset the watermark would make the count permanently zero.
 */
export async function touchLastSeen(): Promise<void> {
  await db
    .update(readerState)
    .set({ lastSeenAt: new Date() })
    .where(eq(readerState.id, 1));
  revalidatePath("/");
}
