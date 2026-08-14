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
  articleDuplicates,
  articles,
  ingestRuns,
  modelMentions,
  models,
  orgs,
  retiredSources,
  sources,
  stories,
  type ArticleCategory,
  type CredibilityReason,
  type SourceCategory,
  type SourceKind,
} from "@/db/schema";
import { PAGE_SIZE, type FeedFilters } from "@/lib/filters";
import type { ModelStatus } from "@/lib/enrich/models";
import {
  parseTag,
  projectName,
  releasesPerWeek,
  repoFromReleaseUrl,
  tagFromUrl,
} from "@/lib/releases";
import { SOURCE_REGISTRY } from "@/lib/sources/registry";

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
  /** 'heuristic' or 'llm' — surfaced so the two are distinguishable. */
  enrichedBy: string;
  /** Set when this article is one outlet's take on a clustered story. */
  storyId: string | null;
  /** Distinct outlets covering that story, including this one. */
  storySourceCount: number | null;
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
        enrichedBy: articles.enrichedBy,
        storyId: articles.storyId,
        storySourceCount: stories.sourceCount,
      })
      .from(articles)
      .innerJoin(sources, eq(sources.id, articles.sourceId))
      .leftJoin(stories, eq(stories.id, articles.storyId))
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

export interface SourceHealth {
  id: number;
  slug: string;
  name: string;
  url: string | null;
  feedUrl: string | null;
  kind: SourceKind;
  category: SourceCategory;
  baseCredibility: number;
  orgSlug: string | null;
  enabled: boolean;
  mutedAt: Date | null;
  pollMinutes: number;
  consecutiveFailures: number;
  disabledReason: string | null;
  lastPolledAt: Date | null;
  /** True once a user has edited this row, which protects it from re-seeds. */
  managedByUser: boolean;
  articleCount: number;
  /** Outcome of the most recent poll. */
  lastOk: boolean | null;
  lastError: string | null;
  itemsNew7d: number;
}

/**
 * Every source with the numbers needed to judge whether it is pulling its
 * weight: how much it has contributed, whether its last poll worked, and what
 * broke if it didn't.
 */
export async function getSourcesWithHealth(): Promise<SourceHealth[]> {
  const since = new Date(Date.now() - 7 * 86_400_000);

  // Aggregates are fetched separately and merged rather than written as
  // correlated subqueries: inside a raw `sql` fragment drizzle renders
  // `sources.id` unqualified, so Postgres reads it as a column of the *inner*
  // table and the query fails.
  const [rows, articleCounts, runStats, latestRuns] = await Promise.all([
    db.select().from(sources).orderBy(sources.category, sources.name),

    db
      .select({ sourceId: articles.sourceId, value: count() })
      .from(articles)
      .groupBy(articles.sourceId),

    db
      .select({
        sourceId: ingestRuns.sourceId,
        itemsNew: sql<number>`coalesce(sum(${ingestRuns.itemsNew}), 0)::int`,
      })
      .from(ingestRuns)
      .where(gte(ingestRuns.ranAt, since))
      .groupBy(ingestRuns.sourceId),

    // DISTINCT ON is the cheap way to get the newest run per source.
    db.execute<{ source_id: number; ok: boolean; error: string | null }>(sql`
      select distinct on (source_id) source_id, ok, error
      from ${ingestRuns}
      order by source_id, ran_at desc
    `),
  ]);

  const countBySource = new Map(
    articleCounts.map((r) => [r.sourceId, Number(r.value)]),
  );
  const itemsBySource = new Map(
    runStats.map((r) => [r.sourceId, Number(r.itemsNew)]),
  );
  const lastRunBySource = new Map(
    [...latestRuns].map((r) => [r.source_id, r]),
  );

  return rows.map((s) => {
    const lastRun = lastRunBySource.get(s.id);
    return {
      id: s.id,
      slug: s.slug,
      name: s.name,
      url: s.url,
      feedUrl: s.feedUrl,
      kind: s.kind,
      category: s.category,
      baseCredibility: s.baseCredibility,
      orgSlug: s.orgSlug,
      enabled: s.enabled,
      mutedAt: s.mutedAt,
      pollMinutes: s.pollMinutes,
      consecutiveFailures: s.consecutiveFailures,
      disabledReason: s.disabledReason,
      lastPolledAt: s.lastPolledAt,
      managedByUser: s.meta?.managedBy === "user",
      articleCount: countBySource.get(s.id) ?? 0,
      lastOk: lastRun?.ok ?? null,
      lastError: lastRun?.error ?? null,
      itemsNew7d: itemsBySource.get(s.id) ?? 0,
    };
  });
}

export interface StoryDetail {
  id: string;
  headline: string;
  summary: string | null;
  category: ArticleCategory;
  firstSeenAt: Date;
  lastUpdatedAt: Date;
  articleCount: number;
  sourceCount: number;
  topCredibility: number;
  orgSlugs: string[];
  tags: string[];
  clusteredBy: string;
  articles: FeedArticle[];
  /** Outlets that carried the story but were folded in during dedup. */
  alsoCarriedBy: { sourceName: string; url: string; title: string | null }[];
}

/** One clustered story with every article and outlet covering it. */
export async function getStory(id: string): Promise<StoryDetail | null> {
  const [story] = await db.select().from(stories).where(eq(stories.id, id)).limit(1);
  if (!story) return null;

  const members = await db
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
      enrichedBy: articles.enrichedBy,
      storyId: articles.storyId,
      storySourceCount: sql<number>`${story.sourceCount}`,
    })
    .from(articles)
    .innerJoin(sources, eq(sources.id, articles.sourceId))
    .where(eq(articles.storyId, id))
    .orderBy(articles.publishedAt);

  const dupes = await db
    .select({
      sourceName: sources.name,
      url: articleDuplicates.url,
      title: articleDuplicates.title,
    })
    .from(articleDuplicates)
    .innerJoin(sources, eq(sources.id, articleDuplicates.sourceId))
    .where(
      inArray(
        articleDuplicates.articleId,
        members.map((m) => m.id),
      ),
    )
    .orderBy(articleDuplicates.seenAt);

  return {
    id: story.id,
    headline: story.headline,
    summary: story.summary,
    category: story.category,
    firstSeenAt: story.firstSeenAt,
    lastUpdatedAt: story.lastUpdatedAt,
    articleCount: story.articleCount,
    sourceCount: story.sourceCount,
    topCredibility: story.topCredibility,
    orgSlugs: story.orgSlugs,
    tags: story.tags,
    clusteredBy: story.clusteredBy,
    articles: members,
    alsoCarriedBy: dupes,
  };
}

export interface RadarModel {
  slug: string;
  name: string;
  family: string;
  orgSlug: string | null;
  status: ModelStatus;
  firstSeenAt: Date;
  lastSeenAt: Date;
  releasedAt: Date | null;
  mentionCount: number;
  sourceCount: number;
  topCredibility: number;
  /** The article that best represents where the model currently stands. */
  lead: { id: string; title: string; url: string; publishedAt: Date } | null;
}

/** Every tracked model, most recently active first. */
export async function getRadar(): Promise<RadarModel[]> {
  const rows = await db
    .select({
      slug: models.slug,
      name: models.name,
      family: models.family,
      orgSlug: models.orgSlug,
      status: models.status,
      firstSeenAt: models.firstSeenAt,
      lastSeenAt: models.lastSeenAt,
      releasedAt: models.releasedAt,
      mentionCount: models.mentionCount,
      sourceCount: models.sourceCount,
      topCredibility: models.topCredibility,
      leadId: articles.id,
      leadTitle: articles.title,
      leadUrl: articles.url,
      leadPublishedAt: articles.publishedAt,
    })
    .from(models)
    .leftJoin(articles, eq(articles.id, models.leadArticleId))
    .orderBy(desc(models.lastSeenAt));

  return rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    family: r.family,
    orgSlug: r.orgSlug,
    status: r.status,
    firstSeenAt: r.firstSeenAt,
    lastSeenAt: r.lastSeenAt,
    releasedAt: r.releasedAt,
    mentionCount: r.mentionCount,
    sourceCount: r.sourceCount,
    topCredibility: r.topCredibility,
    lead: r.leadId
      ? {
          id: r.leadId,
          title: r.leadTitle!,
          url: r.leadUrl!,
          publishedAt: r.leadPublishedAt!,
        }
      : null,
  }));
}

/** Every article naming a model, oldest first — the lifecycle timeline. */
export async function getModelTimeline(slug: string): Promise<FeedArticle[]> {
  return db
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
      enrichedBy: articles.enrichedBy,
      storyId: articles.storyId,
      storySourceCount: stories.sourceCount,
    })
    .from(modelMentions)
    .innerJoin(articles, eq(articles.id, modelMentions.articleId))
    .innerJoin(sources, eq(sources.id, articles.sourceId))
    .leftJoin(stories, eq(stories.id, articles.storyId))
    .where(eq(modelMentions.modelSlug, slug))
    .orderBy(articles.publishedAt);
}

export interface ReleaseItem {
  id: string;
  url: string;
  tag: string;
  version: string;
  channel: string | null;
  isPrerelease: boolean;
  isBuild: boolean;
  publishedAt: Date;
  summary: string | null;
}

export interface ReleaseProject {
  repo: string;
  name: string;
  orgSlug: string | null;
  sourceSlug: string;
  latest: ReleaseItem;
  releases: ReleaseItem[];
  /** Releases per week across the observed span. */
  cadence: number;
  last7d: number;
}

/**
 * Shipping activity for every tracked repo, most recently released first.
 *
 * Derived from the articles themselves rather than a separate table: a release
 * is fully described by its URL, so there is nothing to store that ingestion
 * hasn't already captured.
 */
export async function getReleases(): Promise<ReleaseProject[]> {
  const rows = await db
    .select({
      id: articles.id,
      url: articles.url,
      summary: articles.summary,
      publishedAt: articles.publishedAt,
      orgSlug: sources.orgSlug,
      sourceSlug: sources.slug,
    })
    .from(articles)
    .innerJoin(sources, eq(sources.id, articles.sourceId))
    .where(eq(sources.kind, "github_releases"))
    .orderBy(desc(articles.publishedAt));

  const byRepo = new Map<string, ReleaseProject>();
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);

  for (const row of rows) {
    const repo = repoFromReleaseUrl(row.url);
    const tag = tagFromUrl(row.url);
    if (!repo || !tag) continue;

    const parsed = parseTag(tag);
    const item: ReleaseItem = {
      id: row.id,
      url: row.url,
      tag,
      ...parsed,
      publishedAt: row.publishedAt,
      summary: row.summary,
    };

    const existing = byRepo.get(repo);
    if (existing) {
      existing.releases.push(item);
      if (row.publishedAt >= weekAgo) existing.last7d++;
      continue;
    }

    byRepo.set(repo, {
      repo,
      name: projectName(repo),
      orgSlug: row.orgSlug,
      sourceSlug: row.sourceSlug,
      // Rows arrive newest-first, so the first seen is the latest.
      latest: item,
      releases: [item],
      cadence: 0,
      last7d: row.publishedAt >= weekAgo ? 1 : 0,
    });
  }

  const projects = [...byRepo.values()];
  for (const project of projects) {
    project.cadence = releasesPerWeek(project.releases.map((r) => r.publishedAt));
  }

  return projects.sort(
    (a, b) => b.latest.publishedAt.getTime() - a.latest.publishedAt.getTime(),
  );
}

export interface RetiredSource {
  slug: string;
  name: string | null;
  retiredAt: Date;
  /** Whether it can be restored from the stock registry. */
  inRegistry: boolean;
}

/** Stock feeds the user removed, which seeding deliberately skips. */
export async function getRetiredSources(): Promise<RetiredSource[]> {
  const rows = await db
    .select()
    .from(retiredSources)
    .orderBy(desc(retiredSources.retiredAt));

  const known = new Set(SOURCE_REGISTRY.map((s) => s.slug));

  return rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    retiredAt: r.retiredAt,
    inRegistry: known.has(r.slug),
  }));
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
      .from(articles)
      // Muted sources are excluded here too, so the header counts agree with
      // what the feed actually lists rather than reporting a larger corpus.
      .innerJoin(sources, eq(sources.id, articles.sourceId))
      .where(isNull(sources.mutedAt)),
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
