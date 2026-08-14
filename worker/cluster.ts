import { and, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  articleDuplicates,
  articles,
  sources,
  stories,
  type ArticleCategory,
} from "@/db/schema";
import { centroidOf, clusterArticles, type Clusterable } from "@/lib/enrich/cluster";
import { scoreCredibility } from "@/lib/enrich/credibility";
import { currentEmbeddingModel } from "@/lib/embeddings";

/** How far back to cluster. Older stories are settled and not revisited. */
const WINDOW_DAYS = 7;

/** Safety cap on the O(n²) pass. */
const MAX_ARTICLES = 2500;

export interface ClusterSummary {
  scanned: number;
  stories: number;
  articlesClustered: number;
  rescored: number;
}

interface Row extends Clusterable {
  summary: string | null;
  category: ArticleCategory;
  credibility: number;
  impact: number;
  orgSlugs: string[];
  tags: string[];
  url: string;
  author: string | null;
  publisherDomain: string | null;
  corroborationCount: number;
  baseCredibility: number;
}

/**
 * Rebuild story clusters over the recent window.
 *
 * Clustering is recomputed from scratch each run rather than incrementally:
 * a late-arriving article can merge two groups that previously looked
 * separate, and at this scale a full pass is cheap enough to keep the result
 * correct instead of path-dependent.
 */
export async function runClusterCycle(): Promise<ClusterSummary> {
  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000);

  const rows: Row[] = await db
    .select({
      id: articles.id,
      title: articles.title,
      summary: articles.summary,
      sourceId: articles.sourceId,
      publishedAt: articles.publishedAt,
      embedding: articles.embedding,
      category: articles.category,
      credibility: articles.credibility,
      impact: articles.impact,
      orgSlugs: articles.orgSlugs,
      tags: articles.tags,
      url: articles.url,
      author: articles.author,
      publisherDomain: articles.publisherDomain,
      corroborationCount: articles.corroborationCount,
      baseCredibility: sources.baseCredibility,
    })
    .from(articles)
    .innerJoin(sources, eq(sources.id, articles.sourceId))
    .where(gte(articles.publishedAt, since))
    .orderBy(articles.publishedAt)
    .limit(MAX_ARTICLES);

  if (rows.length === 0) {
    return { scanned: 0, stories: 0, articlesClustered: 0, rescored: 0 };
  }

  const clusters = clusterArticles(rows);
  // A lone article is just an article; only shared coverage makes a story.
  const multi = clusters.filter((c) => c.members.length > 1);

  // Clear the window's previous assignments so removed groupings don't linger.
  const ids = rows.map((r) => r.id);
  await db
    .update(articles)
    .set({ storyId: null })
    .where(inArray(articles.id, ids));
  await db.delete(stories).where(gte(stories.lastUpdatedAt, since));

  let articlesClustered = 0;
  let rescored = 0;

  for (const cluster of multi) {
    const members = cluster.members;

    // The most credible member gives the story its headline; ties go to the
    // most recent, which is usually the fullest account.
    const lead = [...members].sort(
      (a, b) =>
        b.credibility - a.credibility ||
        b.publishedAt.getTime() - a.publishedAt.getTime(),
    )[0];

    const sourceCount = await countDistinctOutlets(members);
    const centroid = centroidOf(members.map((m) => m.embedding));

    const [story] = await db
      .insert(stories)
      .values({
        headline: lead.title,
        summary: lead.summary,
        category: lead.category,
        firstSeenAt: members.reduce(
          (min, m) => (m.publishedAt < min ? m.publishedAt : min),
          members[0].publishedAt,
        ),
        lastUpdatedAt: members.reduce(
          (max, m) => (m.publishedAt > max ? m.publishedAt : max),
          members[0].publishedAt,
        ),
        articleCount: members.length,
        sourceCount,
        topCredibility: Math.max(...members.map((m) => m.credibility)),
        maxImpact: Math.max(...members.map((m) => m.impact)),
        orgSlugs: [...new Set(members.flatMap((m) => m.orgSlugs))],
        tags: [...new Set(members.flatMap((m) => m.tags))].slice(0, 12),
        centroid,
        embeddingModel: centroid ? currentEmbeddingModel() : null,
        clusteredBy: cluster.usedEmbeddings ? "embedding" : "title",
      })
      .returning({ id: stories.id });

    await db
      .update(articles)
      .set({ storyId: story.id })
      .where(inArray(articles.id, members.map((m) => m.id)));

    articlesClustered += members.length;

    // Independent coverage is corroboration, which is a credibility input.
    // This is how a rumour carried by one outlet climbs as others pick it up.
    rescored += await applyCorroboration(members, sourceCount);
  }

  return {
    scanned: rows.length,
    stories: multi.length,
    articlesClustered,
    rescored,
  };
}

/**
 * Distinct outlets covering a story: the members' own publishers plus any
 * recorded against them as duplicates during ingestion.
 *
 * Keyed on publisher domain rather than source id. A Google News query is one
 * source row but delivers many publishers — counting feeds reported a
 * syndicated story carried by 11 local stations as a single outlet, which
 * understates corroboration and therefore credibility.
 */
async function countDistinctOutlets(members: Row[]): Promise<number> {
  const outlets = new Set(
    members.map((m) => m.publisherDomain ?? `source:${m.sourceId}`),
  );

  const dupes = await db
    .select({
      sourceId: articleDuplicates.sourceId,
      publisherDomain: articleDuplicates.publisherDomain,
    })
    .from(articleDuplicates)
    .where(inArray(articleDuplicates.articleId, members.map((m) => m.id)));

  for (const dupe of dupes) {
    outlets.add(dupe.publisherDomain ?? `source:${dupe.sourceId}`);
  }
  return outlets.size;
}

/**
 * Raise each member's corroboration to the story's independent-source count
 * and re-score. Only ever raises: ingestion may already have recorded more
 * corroboration than this window can see.
 */
async function applyCorroboration(
  members: Row[],
  sourceCount: number,
): Promise<number> {
  const corroboration = Math.max(sourceCount - 1, 0);
  let changed = 0;

  for (const member of members) {
    if (corroboration <= member.corroborationCount) continue;

    const rescored = scoreCredibility({
      title: member.title,
      summary: member.summary,
      url: member.url,
      baseCredibility: member.baseCredibility,
      publisherDomain: member.publisherDomain,
      author: member.author,
      hasPublishDate: true,
      corroborationCount: corroboration,
    });

    await db
      .update(articles)
      .set({
        corroborationCount: corroboration,
        credibility: rescored.score,
        credibilityReason: rescored.reasons,
        isRumour: rescored.isRumour,
      })
      .where(eq(articles.id, member.id));

    changed++;
  }

  return changed;
}

/** Stories with the most independent coverage, for the feed rail. */
export async function topStories(limit = 10) {
  return db
    .select()
    .from(stories)
    .where(isNotNull(stories.id))
    .orderBy(sql`${stories.sourceCount} desc, ${stories.lastUpdatedAt} desc`)
    .limit(limit);
}
