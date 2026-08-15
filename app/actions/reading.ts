"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { articleReads, readerState, savedArticles } from "@/db/schema";
import { requireUserId } from "@/lib/auth";

/**
 * Reader state actions, scoped to the signed-in user.
 *
 * Every query here filters on `user_id`. Dropping that filter does not fail
 * loudly — it reads or writes across all readers, which looks like corrupted
 * data rather than a missing clause. `requireUserId` throws rather than
 * returning null so a bypassed session can never reach an unscoped query.
 */

/**
 * Record that an article was opened.
 *
 * Called from a click handler that does *not* await it — the browser is
 * already navigating to the publisher, and read state must never delay that.
 * Idempotent, so a double-click is harmless.
 */
export async function markRead(articleId: string): Promise<void> {
  const userId = await requireUserId();
  await db
    .insert(articleReads)
    .values({ userId, articleId })
    .onConflictDoNothing();
  revalidatePath("/");
}

/** Sweep everything currently unread, for when you skim without clicking. */
export async function markAllRead(): Promise<void> {
  const userId = await requireUserId();
  await db.execute(sql`
    insert into ${articleReads} (user_id, article_id)
    select ${userId}::uuid, id from articles
    on conflict (user_id, article_id) do nothing
  `);
  revalidatePath("/");
}

export async function markUnread(articleId: string): Promise<void> {
  const userId = await requireUserId();
  await db
    .delete(articleReads)
    .where(
      and(
        eq(articleReads.userId, userId),
        eq(articleReads.articleId, articleId),
      ),
    );
  revalidatePath("/");
}

/** Star / unstar. Returns the new state so the caller can reflect it. */
export async function toggleSaved(articleId: string): Promise<boolean> {
  const userId = await requireUserId();
  const mine = and(
    eq(savedArticles.userId, userId),
    eq(savedArticles.articleId, articleId),
  );

  const existing = await db
    .select({ articleId: savedArticles.articleId })
    .from(savedArticles)
    .where(mine)
    .limit(1);

  if (existing.length > 0) {
    await db.delete(savedArticles).where(mine);
    revalidatePath("/");
    revalidatePath("/saved");
    return false;
  }

  await db
    .insert(savedArticles)
    .values({ userId, articleId })
    .onConflictDoNothing();
  revalidatePath("/");
  revalidatePath("/saved");
  return true;
}

/**
 * Move the "new since your last visit" watermark to now.
 *
 * Called explicitly rather than on every render: a page load that silently
 * reset the watermark would make the count permanently zero.
 *
 * Upserts because the row is created on first use rather than at sign-up — an
 * UPDATE alone silently does nothing for a reader who has never touched it,
 * which is exactly how the count got stuck at zero on a fresh database before.
 */
export async function touchLastSeen(): Promise<void> {
  const userId = await requireUserId();
  await db
    .insert(readerState)
    .values({ userId, lastSeenAt: new Date() })
    .onConflictDoUpdate({
      target: readerState.userId,
      set: { lastSeenAt: new Date() },
    });
  revalidatePath("/");
}
