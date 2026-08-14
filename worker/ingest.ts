import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  articleDuplicates,
  articles,
  ingestRuns,
  sources,
  type Source,
} from "@/db/schema";
import { enrich } from "@/lib/enrich";
import { canonicalizeUrl, findDuplicate } from "@/lib/enrich/dedup";
import { scoreCredibility } from "@/lib/enrich/credibility";
import { fetchSource } from "@/lib/fetching";
import type { FeedItem } from "@/lib/fetching/types";

/** Consecutive failures before a source is switched off. */
const MAX_FAILURES = 5;
/** How far back to look for the same story when deduping. */
const DEDUP_WINDOW_HOURS = 72;
/** Items older than this are skipped — first poll of a feed isn't a backfill. */
const MAX_AGE_DAYS = 14;

export interface SourceResult {
  slug: string;
  ok: boolean;
  seen: number;
  inserted: number;
  duplicates: number;
  durationMs: number;
  error?: string;
  skipped?: "throttled" | "not-modified";
}

/** Poll one source, enrich what's new, and record the run. */
export async function ingestSource(source: Source): Promise<SourceResult> {
  const startedAt = Date.now();
  const base: SourceResult = {
    slug: source.slug,
    ok: true,
    seen: 0,
    inserted: 0,
    duplicates: 0,
    durationMs: 0,
  };

  try {
    const result = await fetchSource(source);

    if (result.notModified) {
      await db
        .update(sources)
        .set({ lastPolledAt: new Date(), consecutiveFailures: 0 })
        .where(eq(sources.id, source.id));
      return { ...base, durationMs: Date.now() - startedAt, skipped: "not-modified" };
    }

    const cutoff = new Date(Date.now() - MAX_AGE_DAYS * 86_400_000);
    const fresh = result.items.filter((i) => i.publishedAt >= cutoff);

    let inserted = 0;
    let duplicates = 0;

    for (const item of fresh) {
      const outcome = await storeItem(source, item);
      if (outcome === "inserted") inserted++;
      else if (outcome === "duplicate") duplicates++;
    }

    await db
      .update(sources)
      .set({
        lastPolledAt: new Date(),
        consecutiveFailures: 0,
        disabledReason: null,
        etag: result.etag ?? source.etag,
        lastModified: result.lastModified ?? source.lastModified,
      })
      .where(eq(sources.id, source.id));

    const durationMs = Date.now() - startedAt;
    await db.insert(ingestRuns).values({
      sourceId: source.id,
      ok: true,
      itemsSeen: result.items.length,
      itemsNew: inserted,
      itemsDuplicate: duplicates,
      durationMs,
    });

    return {
      ...base,
      seen: result.items.length,
      inserted,
      duplicates,
      durationMs,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const failures = source.consecutiveFailures + 1;
    const durationMs = Date.now() - startedAt;

    // Publishers move their feed endpoints; a source that keeps failing gets
    // switched off with the reason recorded rather than retried forever.
    await db
      .update(sources)
      .set({
        lastPolledAt: new Date(),
        consecutiveFailures: failures,
        ...(failures >= MAX_FAILURES
          ? {
              enabled: false,
              disabledReason: `${failures} consecutive failures: ${message.slice(0, 200)}`,
            }
          : {}),
      })
      .where(eq(sources.id, source.id));

    await db.insert(ingestRuns).values({
      sourceId: source.id,
      ok: false,
      durationMs,
      error: message.slice(0, 500),
    });

    return { ...base, ok: false, error: message, durationMs };
  }
}

type StoreOutcome = "inserted" | "duplicate" | "skipped";

/**
 * Enrich and persist one item.
 *
 * A story already covered by another outlet is not discarded: it's recorded in
 * article_duplicates and the original's corroboration count goes up, which can
 * lift its credibility. That is how a rumour earns its way toward confirmed.
 */
async function storeItem(
  source: Source,
  item: FeedItem,
): Promise<StoreOutcome> {
  const canonical = canonicalizeUrl(item.url);

  const existing = await db
    .select({ id: articles.id })
    .from(articles)
    .where(eq(articles.canonicalUrl, canonical))
    .limit(1);
  if (existing.length > 0) return "skipped";

  const since = new Date(Date.now() - DEDUP_WINDOW_HOURS * 3_600_000);
  const recent = await db
    .select({
      id: articles.id,
      title: articles.title,
      sourceId: articles.sourceId,
      credibility: articles.credibility,
      corroborationCount: articles.corroborationCount,
      url: articles.url,
      publisherDomain: articles.publisherDomain,
      summary: articles.summary,
      author: articles.author,
    })
    .from(articles)
    .where(gte(articles.publishedAt, since))
    .orderBy(desc(articles.publishedAt))
    .limit(600);

  const duplicate = findDuplicate(item.title, recent);

  if (duplicate) {
    // Only a *different* outlet counts as corroboration; the same feed
    // rewording its own headline proves nothing.
    if (duplicate.match.sourceId === source.id) return "skipped";

    await db
      .insert(articleDuplicates)
      .values({
        articleId: duplicate.match.id,
        sourceId: source.id,
        url: item.url,
        title: item.title,
        publisherDomain: item.publisherDomain ?? null,
        similarity: duplicate.similarity,
      })
      .onConflictDoNothing();

    await bumpCorroboration(duplicate.match.id);
    return "duplicate";
  }

  const enriched = enrich({
    item,
    baseCredibility: source.baseCredibility,
    sourceOrgSlug: source.orgSlug,
  });

  await db
    .insert(articles)
    .values({
      sourceId: source.id,
      url: item.url,
      canonicalUrl: enriched.canonicalUrl,
      publisherDomain: enriched.publisherDomain,
      title: item.title,
      author: item.author ?? null,
      publishedAt: item.publishedAt,
      summary: enriched.summary,
      rawContentTruncated: item.content ?? null,
      category: enriched.category,
      credibility: enriched.credibility,
      credibilityReason: enriched.credibilityReason,
      isRumour: enriched.isRumour,
      impact: enriched.impact,
      orgSlugs: enriched.orgSlugs,
      tags: enriched.tags,
      enrichedBy: "heuristic",
    })
    .onConflictDoNothing();

  return "inserted";
}

/**
 * Increment corroboration and re-run the scorer, so an item that several
 * outlets have now picked up can gain its +1 without waiting for a re-enrich.
 */
async function bumpCorroboration(articleId: string): Promise<void> {
  const [row] = await db
    .update(articles)
    .set({ corroborationCount: sql`${articles.corroborationCount} + 1` })
    .where(eq(articles.id, articleId))
    .returning({
      title: articles.title,
      summary: articles.summary,
      url: articles.url,
      author: articles.author,
      publisherDomain: articles.publisherDomain,
      sourceId: articles.sourceId,
      corroborationCount: articles.corroborationCount,
    });
  if (!row) return;

  const [src] = await db
    .select({ baseCredibility: sources.baseCredibility })
    .from(sources)
    .where(eq(sources.id, row.sourceId))
    .limit(1);
  if (!src) return;

  const rescored = scoreCredibility({
    title: row.title,
    summary: row.summary,
    url: row.url,
    baseCredibility: src.baseCredibility,
    publisherDomain: row.publisherDomain,
    author: row.author,
    hasPublishDate: true,
    corroborationCount: row.corroborationCount,
  });

  await db
    .update(articles)
    .set({
      credibility: rescored.score,
      credibilityReason: rescored.reasons,
      isRumour: rescored.isRumour,
    })
    .where(eq(articles.id, articleId));
}

/** Sources due for a poll, honouring each one's pollMinutes throttle. */
export async function dueSources(slugs?: string[]): Promise<Source[]> {
  const rows = await db
    .select()
    .from(sources)
    .where(
      slugs?.length
        ? inArray(sources.slug, slugs)
        : and(eq(sources.enabled, true)),
    );

  // An explicit slug list is a manual override — poll it regardless of throttle.
  if (slugs?.length) return rows;

  const now = Date.now();
  return rows.filter(
    (s) =>
      !s.lastPolledAt ||
      now - s.lastPolledAt.getTime() >= s.pollMinutes * 60_000,
  );
}

export interface CycleSummary {
  polled: number;
  inserted: number;
  duplicates: number;
  failed: number;
  results: SourceResult[];
}

/**
 * One full ingestion cycle. Sources are polled sequentially: politeFetch
 * throttles per host anyway, and staying serial keeps us a well-behaved client.
 */
export async function runCycle(slugs?: string[]): Promise<CycleSummary> {
  const due = await dueSources(slugs);
  const results: SourceResult[] = [];

  for (const source of due) {
    results.push(await ingestSource(source));
  }

  return {
    polled: results.length,
    inserted: results.reduce((n, r) => n + r.inserted, 0),
    duplicates: results.reduce((n, r) => n + r.duplicates, 0),
    failed: results.filter((r) => !r.ok).length,
    results,
  };
}
