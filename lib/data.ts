import {
  and,
  arrayOverlaps,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  sql,
  type SQL,
} from "drizzle-orm";
import { db } from "@/db/client";
import {
  articles,
  ingestRuns,
  orgs,
  sources,
  type ArticleCategory,
  type CredibilityReason,
} from "@/db/schema";
import { PAGE_SIZE, type FeedFilters } from "@/lib/filters";

export interface FeedArticle {
  id: string;
  url: string;
  title: string;
  summary: string | null;
  publishedAt: Date;
  category: ArticleCategory;
  credibility: number;
  credibilityReason: CredibilityReason[];
  isRumour: boolean;
  impact: number;
  orgSlugs: string[];
  tags: string[];
  corroborationCount: number;
  publisherDomain: string | null;
  sourceName: string;
  sourceSlug: string;
}

/** The weighted tsvector — must mirror articles_search_idx to use it. */
const SEARCH_VECTOR = sql`(
  setweight(to_tsvector('english', ${articles.title}), 'A') ||
  setweight(to_tsvector('english', coalesce(${articles.summary}, '')), 'B')
)`;

/** Translate the URL filters into SQL predicates. */
function buildWhere(f: FeedFilters): SQL[] {
  const clauses: SQL[] = [];

  // Muted sources stay ingested but drop out of the feed.
  clauses.push(isNull(sources.mutedAt));

  if (f.q) {
    clauses.push(
      sql`${SEARCH_VECTOR} @@ websearch_to_tsquery('english', ${f.q})`,
    );
  }
  if (f.categories.length) {
    clauses.push(inArray(articles.category, f.categories));
  }
  if (f.orgs.length) {
    clauses.push(arrayOverlaps(articles.orgSlugs, f.orgs));
  }
  if (f.tags.length) {
    clauses.push(arrayOverlaps(articles.tags, f.tags));
  }
  if (f.sources.length) {
    clauses.push(inArray(sources.slug, f.sources));
  }
  if (f.minCredibility > 1) {
    clauses.push(gte(articles.credibility, f.minCredibility));
  }
  if (f.from) clauses.push(gte(articles.publishedAt, f.from));
  if (f.to) clauses.push(lte(articles.publishedAt, f.to));

  return clauses;
}

function orderFor(f: FeedFilters): SQL[] {
  // A text search orders by relevance first; without a query that rank is 0
  // for every row and the sort would be arbitrary.
  if (f.q) {
    return [
      desc(sql`ts_rank(${SEARCH_VECTOR}, websearch_to_tsquery('english', ${f.q}))`),
      desc(articles.publishedAt),
    ];
  }
  switch (f.sort) {
    case "credibility":
      return [desc(articles.credibility), desc(articles.publishedAt)];
    case "impact":
      return [desc(articles.impact), desc(articles.publishedAt)];
    default:
      return [desc(articles.publishedAt)];
  }
}

export async function getFeed(
  f: FeedFilters,
): Promise<{ items: FeedArticle[]; total: number }> {
  const where = and(...buildWhere(f));

  const [rows, [{ value: total }]] = await Promise.all([
    db
      .select({
        id: articles.id,
        url: articles.url,
        title: articles.title,
        summary: articles.summary,
        publishedAt: articles.publishedAt,
        category: articles.category,
        credibility: articles.credibility,
        credibilityReason: articles.credibilityReason,
        isRumour: articles.isRumour,
        impact: articles.impact,
        orgSlugs: articles.orgSlugs,
        tags: articles.tags,
        corroborationCount: articles.corroborationCount,
        publisherDomain: articles.publisherDomain,
        sourceName: sources.name,
        sourceSlug: sources.slug,
      })
      .from(articles)
      .innerJoin(sources, eq(sources.id, articles.sourceId))
      .where(where)
      .orderBy(...orderFor(f))
      .limit(PAGE_SIZE)
      .offset((f.page - 1) * PAGE_SIZE),
    db
      .select({ value: count() })
      .from(articles)
      .innerJoin(sources, eq(sources.id, articles.sourceId))
      .where(where),
  ]);

  return { items: rows, total };
}

export interface FacetCount {
  value: string;
  label: string;
  count: number;
}

/**
 * Counts for the filter rail.
 *
 * Deliberately computed over the whole unfiltered corpus rather than the
 * current result set: a facet that shows 0 because of an unrelated active
 * filter looks broken, and a rail that reshuffles on every click is unusable.
 */
export async function getFacets(): Promise<{
  categories: FacetCount[];
  orgs: FacetCount[];
  tags: FacetCount[];
  sources: FacetCount[];
}> {
  const [categoryRows, orgRows, tagRows, sourceRows] = await Promise.all([
    db
      .select({ value: articles.category, count: count() })
      .from(articles)
      .groupBy(articles.category),
    db
      .select({
        value: sql<string>`unnested.slug`,
        count: sql<number>`count(*)::int`,
      })
      .from(sql`${articles}, unnest(${articles.orgSlugs}) as unnested(slug)`)
      .groupBy(sql`unnested.slug`),
    db
      .select({
        value: sql<string>`unnested.tag`,
        count: sql<number>`count(*)::int`,
      })
      .from(sql`${articles}, unnest(${articles.tags}) as unnested(tag)`)
      .groupBy(sql`unnested.tag`),
    db
      .select({
        value: sources.slug,
        label: sources.name,
        count: count(articles.id),
      })
      .from(sources)
      .leftJoin(articles, eq(articles.sourceId, sources.id))
      .where(isNull(sources.mutedAt))
      .groupBy(sources.slug, sources.name),
  ]);

  const orgNames = new Map(
    (await db.select({ slug: orgs.slug, name: orgs.name }).from(orgs)).map(
      (o) => [o.slug, o.name],
    ),
  );

  const byCountDesc = (a: { count: number }, b: { count: number }) =>
    b.count - a.count;

  return {
    categories: categoryRows.map((r) => ({
      value: r.value,
      label: r.value,
      count: r.count,
    })),
    orgs: orgRows
      .map((r) => ({
        value: r.value,
        label: orgNames.get(r.value) ?? r.value,
        count: Number(r.count),
      }))
      .sort(byCountDesc),
    tags: tagRows
      .map((r) => ({ value: r.value, label: r.value, count: Number(r.count) }))
      .sort(byCountDesc)
      .slice(0, 30),
    sources: sourceRows
      .filter((r) => r.count > 0)
      .map((r) => ({ value: r.value, label: r.label, count: r.count }))
      .sort(byCountDesc),
  };
}

export interface FeedStats {
  total: number;
  last24h: number;
  rumours: number;
  lastIngestAt: Date | null;
  activeSources: number;
  failingSources: number;
}

export async function getStats(): Promise<FeedStats> {
  const since = new Date(Date.now() - 86_400_000);

  const [[totals], [lastRun], [sourceCounts]] = await Promise.all([
    db
      .select({
        total: count(),
        // The comparison is built with drizzle's `gte` rather than
        // interpolating `since` directly: a bare JS Date reaches the driver
        // without the column's type mapper and fails to serialise.
        last24h: sql<number>`(count(*) filter (where ${gte(articles.publishedAt, since)}))::int`,
        rumours: sql<number>`(count(*) filter (where ${articles.isRumour}))::int`,
      })
      .from(articles),
    db
      .select({ ranAt: ingestRuns.ranAt })
      .from(ingestRuns)
      .orderBy(desc(ingestRuns.ranAt))
      .limit(1),
    db
      .select({
        active: sql<number>`(count(*) filter (where ${sources.enabled}))::int`,
        failing: sql<number>`(count(*) filter (where ${sources.consecutiveFailures} > 0))::int`,
      })
      .from(sources),
  ]);

  return {
    total: totals?.total ?? 0,
    last24h: Number(totals?.last24h ?? 0),
    rumours: Number(totals?.rumours ?? 0),
    lastIngestAt: lastRun?.ranAt ?? null,
    activeSources: Number(sourceCounts?.active ?? 0),
    failingSources: Number(sourceCounts?.failing ?? 0),
  };
}
