import { and, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  articleDuplicates,
  articles,
  ingestRuns,
  sources,
  stories,
  type Source,
} from "@/db/schema";
import { enrich } from "@/lib/enrich";
import { canonicalizeUrl, findDuplicate } from "@/lib/enrich/dedup";
import { scoreCredibility } from "@/lib/enrich/credibility";
import {
  SEMANTIC_DUPLICATE_DISTANCE,
  currentEmbeddingModel,
  embedItems,
  embeddingText,
} from "@/lib/embeddings";
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
  /** Items dropped by the URL pre-filter, before any embedding was paid for. */
  preFiltered: number;
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
    preFiltered: 0,
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

    // Discard anything we already hold *before* embedding. Feeds re-serve
    // their whole window on every poll, and the aggregator queries can't use
    // conditional GET at all, so embedding first meant paying to re-embed the
    // same ~100 items 48 times a day — about 99% of all embedding spend.
    const unseen = await filterAlreadySeen(fresh);

    // One batched request for what's genuinely new. Returns null vectors when
    // embeddings are off or the call fails, in which case dedup falls back to
    // title similarity.
    const embedded = await embedItems(unseen, (item) =>
      embeddingText(item.title, item.content),
    );

    let inserted = 0;
    let duplicates = 0;

    for (const { item, embedding } of embedded) {
      const outcome = await storeItem(source, item, embedding);
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
      preFiltered: fresh.length - unseen.length,
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

/**
 * Drop items we already hold, using only the two exact-match URL checks.
 *
 * Deliberately cheap and batched: two indexed queries for the whole poll
 * rather than two per item, and no embeddings. Everything surviving this is a
 * candidate worth paying to embed; everything else would have been discarded
 * by `storeItem` anyway.
 *
 * This is an optimisation, not the dedup itself — `storeItem` still repeats
 * both checks, which keeps it correct if called directly and closes the race
 * between this filter and the insert.
 */
export async function filterAlreadySeen(items: FeedItem[]): Promise<FeedItem[]> {
  if (items.length === 0) return [];

  const canonicalById = new Map(items.map((i) => [i.url, canonicalizeUrl(i.url)]));
  const canonicals = [...new Set(canonicalById.values())];
  const urls = [...new Set(items.map((i) => i.url))];

  const [knownArticles, knownDuplicates] = await Promise.all([
    db
      .select({ canonicalUrl: articles.canonicalUrl })
      .from(articles)
      .where(inArray(articles.canonicalUrl, canonicals)),
    db
      .select({ url: articleDuplicates.url })
      .from(articleDuplicates)
      .where(inArray(articleDuplicates.url, urls)),
  ]);

  const seenCanonical = new Set(knownArticles.map((r) => r.canonicalUrl));
  const seenDuplicate = new Set(knownDuplicates.map((r) => r.url));

  const out: FeedItem[] = [];
  for (const item of items) {
    const canonical = canonicalById.get(item.url)!;
    // A feed can list the same story twice under different tracking params;
    // without this both copies would be embedded and one thrown away.
    if (seenCanonical.has(canonical) || seenDuplicate.has(item.url)) continue;
    seenCanonical.add(canonical);
    out.push(item);
  }
  return out;
}

type StoreOutcome = "inserted" | "duplicate" | "skipped";

interface DuplicateMatch {
  id: string;
  sourceId: number;
  publisherDomain: string | null;
  similarity: number;
}

/**
 * Whether an incoming item comes from the same outlet as the article it
 * matched. Falls back to the feed only when neither side names a publisher.
 */
export function sameOutlet(
  match: { sourceId: number; publisherDomain: string | null },
  source: { id: number },
  item: { publisherDomain?: string | null },
): boolean {
  if (item.publisherDomain && match.publisherDomain) {
    return item.publisherDomain === match.publisherDomain;
  }
  // One side is a direct feed with no separate publisher: same row means
  // the same outlet.
  if (!item.publisherDomain && !match.publisherDomain) {
    return match.sourceId === source.id;
  }
  // Mixed — an aggregator's copy of a story we hold directly, or vice versa.
  // Different provenance, so treat them as different outlets.
  return false;
}

/**
 * Nearest neighbour within the dedup window, by cosine distance.
 *
 * The `embedding_model` filter is not optional: vectors from different models
 * occupy different spaces, so comparing across them produces confident
 * nonsense. Rows embedded by an older model are simply invisible here.
 */
async function findSemanticDuplicate(
  embedding: number[],
  since: Date,
): Promise<DuplicateMatch | null> {
  const literal = toVectorLiteral(embedding);
  const model = currentEmbeddingModel();

  const [match] = await db
    .select({
      id: articles.id,
      sourceId: articles.sourceId,
      publisherDomain: articles.publisherDomain,
      distance: sql<number>`${articles.embedding} <=> ${literal}::vector`,
    })
    .from(articles)
    .where(
      and(
        gte(articles.publishedAt, since),
        isNotNull(articles.embedding),
        eq(articles.embeddingModel, model),
      ),
    )
    .orderBy(sql`${articles.embedding} <=> ${literal}::vector`)
    .limit(1);

  if (!match || Number(match.distance) > SEMANTIC_DUPLICATE_DISTANCE) {
    return null;
  }

  return {
    id: match.id,
    sourceId: match.sourceId,
    publisherDomain: match.publisherDomain,
    similarity: 1 - Number(match.distance),
  };
}

/** Pre-embedding fallback: token overlap against recent headlines. */
async function findTitleDuplicate(
  title: string,
  since: Date,
): Promise<DuplicateMatch | null> {
  const recent = await db
    .select({
      id: articles.id,
      title: articles.title,
      sourceId: articles.sourceId,
      publisherDomain: articles.publisherDomain,
    })
    .from(articles)
    .where(gte(articles.publishedAt, since))
    .orderBy(desc(articles.publishedAt))
    .limit(600);

  const hit = findDuplicate(title, recent);
  return hit
    ? {
        id: hit.match.id,
        sourceId: hit.match.sourceId,
        publisherDomain: hit.match.publisherDomain,
        similarity: hit.similarity,
      }
    : null;
}

/** pgvector accepts a bracketed list; JSON.stringify already produces one. */
export function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

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
  embedding: number[] | null,
): Promise<StoreOutcome> {
  const canonical = canonicalizeUrl(item.url);

  const existing = await db
    .select({ id: articles.id })
    .from(articles)
    .where(eq(articles.canonicalUrl, canonical))
    .limit(1);
  if (existing.length > 0) return "skipped";

  // Already known as another outlet's take on an existing story. Without this
  // check every poll would redo the dedup work for items that will never be
  // inserted, and re-touch their corroboration.
  const knownDuplicate = await db
    .select({ id: articleDuplicates.id })
    .from(articleDuplicates)
    .where(eq(articleDuplicates.url, item.url))
    .limit(1);
  if (knownDuplicate.length > 0) return "skipped";

  const since = new Date(Date.now() - DEDUP_WINDOW_HOURS * 3_600_000);

  const duplicate = embedding
    ? await findSemanticDuplicate(embedding, since)
    : await findTitleDuplicate(item.title, since);

  if (duplicate) {
    // Only a *different* outlet counts as corroboration; one outlet rewording
    // its own headline proves nothing.
    //
    // Identity is the publisher, not the feed. A Google News query is a single
    // source row but delivers many publishers — one syndicated wire story
    // arrived through it from 11 different local stations — so comparing feeds
    // would throw away ten genuine corroborations as "same source".
    if (sameOutlet(duplicate, source, item)) return "skipped";

    const inserted = await db
      .insert(articleDuplicates)
      .values({
        articleId: duplicate.id,
        sourceId: source.id,
        url: item.url,
        title: item.title,
        publisherDomain: item.publisherDomain ?? null,
        similarity: duplicate.similarity,
      })
      .onConflictDoNothing()
      .returning({ id: articleDuplicates.id });

    // Only recount when a genuinely new outlet was recorded.
    if (inserted.length > 0) await recomputeCorroboration(duplicate.id);
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
      embedding,
      embeddingModel: embedding ? currentEmbeddingModel() : null,
    })
    .onConflictDoNothing();

  return "inserted";
}

/**
 * Recount corroboration from the duplicate records and re-run the scorer, so
 * an item several outlets have picked up gains its +1 without waiting for a
 * re-enrich.
 *
 * Derived rather than incremented: an incrementing counter drifts upward every
 * time a feed re-serves an item we've already matched, and corroboration feeds
 * the credibility score, so drift there quietly inflates trust.
 */
export async function recomputeCorroboration(articleId: string): Promise<void> {
  // Count publishers, not feeds: several publishers reach us through one
  // aggregator query, and they are independent corroboration.
  const [{ outlets }] = await db
    .select({
      outlets: sql<number>`count(distinct coalesce(${articleDuplicates.publisherDomain}, ${articleDuplicates.sourceId}::text))::int`,
    })
    .from(articleDuplicates)
    .where(eq(articleDuplicates.articleId, articleId));

  // Corroboration has two sources: outlets dedup folded into this article, and
  // sibling articles the clustering pass grouped with it. Take the larger, or
  // whichever job ran last would undo the other's finding.
  const [viaStory] = await db
    .select({ sourceCount: stories.sourceCount })
    .from(articles)
    .innerJoin(stories, eq(stories.id, articles.storyId))
    .where(eq(articles.id, articleId))
    .limit(1);

  const corroboration = Math.max(
    Number(outlets),
    viaStory ? viaStory.sourceCount - 1 : 0,
  );

  const [row] = await db
    .update(articles)
    .set({ corroborationCount: corroboration })
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
  /** Items skipped before embedding — the difference between cents and dollars. */
  preFiltered: number;
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
    preFiltered: results.reduce((n, r) => n + r.preFiltered, 0),
    failed: results.filter((r) => !r.ok).length,
    results,
  };
}
