import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  serial,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

/** How a source is fetched. Each maps to a module in lib/fetching/. */
export type SourceKind =
  | "rss"
  | "github_releases"
  | "google_news"
  | "arxiv"
  | "hf_papers"
  | "hf_models"
  | "hn"
  | "reddit";

/** Editorial grouping, used for the source list and coarse filtering. */
export type SourceCategory =
  | "first_party"
  | "press"
  | "analyst"
  | "research"
  | "tooling"
  | "community"
  | "leaks"
  | "aggregator";

/**
 * What an article is about. Drives the category filter and badge colours.
 * Ordered roughly by how much the user cares about it.
 */
export type ArticleCategory =
  | "model-launch"
  | "model-leak"
  | "feature-launch"
  | "tool-launch"
  | "research-paper"
  | "deal"
  | "infra-compute"
  | "benchmark"
  | "policy"
  | "people"
  | "other";

/** One rule that moved an article's credibility, kept so the UI can explain it. */
export interface CredibilityReason {
  rule: string;
  delta: number;
  detail?: string;
}

// ---------------------------------------------------------------------------
// orgs — the companies we track. Drives both entity matching and the filter rail.
// ---------------------------------------------------------------------------
export const orgs = pgTable("orgs", {
  slug: text("slug").primaryKey(),
  name: text("name").notNull(),
  /** Match terms: product names, model families, common shorthands. */
  aliases: text("aliases").array().notNull().default(sql`'{}'::text[]`),
  kind: text("kind").notNull().default("lab"),
  /** Domains that count as this org speaking for itself (credibility +1). */
  domains: text("domains").array().notNull().default(sql`'{}'::text[]`),
  accent: text("accent").notNull().default("#8b8b8b"),
  sortOrder: smallint("sort_order").notNull().default(100),
});

// ---------------------------------------------------------------------------
// sources — every feed we poll.
// ---------------------------------------------------------------------------
export const sources = pgTable(
  "sources",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    /** Human-facing homepage. */
    url: text("url"),
    /** What the fetcher actually hits. */
    feedUrl: text("feed_url"),
    kind: text("kind").$type<SourceKind>().notNull().default("rss"),
    category: text("category")
      .$type<SourceCategory>()
      .notNull()
      .default("press"),
    /** Starting credibility 1–5 before per-article adjustments. */
    baseCredibility: smallint("base_credibility").notNull(),
    /** Set when a feed only ever covers one company. */
    orgSlug: text("org_slug").references(() => orgs.slug, {
      onDelete: "set null",
    }),
    enabled: boolean("enabled").notNull().default(true),
    /** User-hidden but still ingested — distinct from disabled. */
    mutedAt: timestamp("muted_at", { withTimezone: true }),
    /** Minimum minutes between polls; slower feeds don't need every cycle. */
    pollMinutes: integer("poll_minutes").notNull().default(30),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    disabledReason: text("disabled_reason"),
    lastPolledAt: timestamp("last_polled_at", { withTimezone: true }),
    /** Conditional-GET caches so we re-download only when something changed. */
    etag: text("etag"),
    lastModified: text("last_modified"),
    meta: jsonb("meta").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("sources_enabled_idx").on(t.enabled),
    index("sources_kind_idx").on(t.kind),
  ],
);

// ---------------------------------------------------------------------------
// articles — the feed itself.
// ---------------------------------------------------------------------------
export const articles = pgTable(
  "articles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: integer("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    /** As published. Unique so re-polls are no-ops. */
    url: text("url").notNull().unique(),
    /** Tracking params stripped; the key we dedupe on. */
    canonicalUrl: text("canonical_url").notNull(),
    /** Real publisher host — differs from the source for Google News items. */
    publisherDomain: text("publisher_domain"),
    title: text("title").notNull(),
    author: text("author"),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
    ingestedAt: timestamp("ingested_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    summary: text("summary"),
    rawContentTruncated: text("raw_content_truncated"),

    category: text("category").$type<ArticleCategory>().notNull().default("other"),
    /** 1 (rumour) … 5 (first-party confirmed). */
    credibility: smallint("credibility").notNull(),
    /** The rules that produced `credibility`, for the hover explanation. */
    credibilityReason: jsonb("credibility_reason")
      .$type<CredibilityReason[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    isRumour: boolean("is_rumour").notNull().default(false),
    /** 0–100 heuristic prominence, used for the "impact" sort. */
    impact: smallint("impact").notNull().default(0),

    orgSlugs: text("org_slugs").array().notNull().default(sql`'{}'::text[]`),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    /** Independent outlets seen carrying the same story. */
    corroborationCount: integer("corroboration_count").notNull().default(0),
    /**
     * The cluster this belongs to, if any. An article belongs to at most one
     * story, so this is a plain FK rather than a join table. Set to null on
     * story deletion so re-clustering can reassign it.
     */
    storyId: uuid("story_id"),

    /**
     * Semantic dedup vector. Null when embeddings are switched off or the
     * call failed — dedup falls back to title similarity in that case.
     */
    embedding: vector("embedding", { dimensions: 1536 }),
    /**
     * Which model produced `embedding`. Vectors from different models are not
     * comparable, so every similarity query must filter on this.
     */
    embeddingModel: text("embedding_model"),
    /** 'heuristic' until the LLM pass rewrites the row as 'llm'. */
    enrichedBy: text("enriched_by").notNull().default("heuristic"),
    enrichedAt: timestamp("enriched_at", { withTimezone: true }),
    lang: text("lang").notNull().default("en"),
  },
  (t) => [
    index("articles_published_idx").on(t.publishedAt.desc()),
    index("articles_category_idx").on(t.category),
    index("articles_credibility_idx").on(t.credibility),
    index("articles_source_idx").on(t.sourceId),
    uniqueIndex("articles_canonical_url_idx").on(t.canonicalUrl),
    index("articles_orgs_idx").using("gin", t.orgSlugs),
    index("articles_tags_idx").using("gin", t.tags),
    index("articles_enriched_by_idx").on(t.enrichedBy),
    index("articles_story_idx").on(t.storyId),
    // HNSW over cosine distance, which is what the dedup query orders by.
    index("articles_embedding_idx").using(
      "hnsw",
      t.embedding.op("vector_cosine_ops"),
    ),
    // Weighted full-text search: title outranks summary.
    // Tags are deliberately absent — array_to_string is only STABLE, so
    // Postgres rejects it in an index expression. Tag lookups go through
    // articles_tags_idx instead, which is the right index for them anyway.
    index("articles_search_idx").using(
      "gin",
      sql`(
        setweight(to_tsvector('english', ${t.title}), 'A') ||
        setweight(to_tsvector('english', coalesce(${t.summary}, '')), 'B')
      )`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// stories — one event, as covered by several outlets.
//
// A story exists only where two or more articles describe the same thing; a
// lone article is just an article. Aggregates are denormalised here so the
// feed can show "7 sources" without a join per row.
// ---------------------------------------------------------------------------
export const stories = pgTable(
  "stories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Taken from the most credible member, tie-broken by recency. */
    headline: text("headline").notNull(),
    summary: text("summary"),
    category: text("category").$type<ArticleCategory>().notNull().default("other"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull(),
    lastUpdatedAt: timestamp("last_updated_at", { withTimezone: true }).notNull(),
    articleCount: integer("article_count").notNull().default(0),
    /** Distinct outlets, including those recorded as duplicates. */
    sourceCount: integer("source_count").notNull().default(0),
    topCredibility: smallint("top_credibility").notNull().default(1),
    maxImpact: smallint("max_impact").notNull().default(0),
    orgSlugs: text("org_slugs").array().notNull().default(sql`'{}'::text[]`),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    /** Mean of member embeddings; null when clustered by title similarity. */
    centroid: vector("centroid", { dimensions: 1536 }),
    embeddingModel: text("embedding_model"),
    /** 'embedding' or 'title' — how this cluster was formed. */
    clusteredBy: text("clustered_by").notNull().default("title"),
  },
  (t) => [
    index("stories_last_updated_idx").on(t.lastUpdatedAt.desc()),
    index("stories_source_count_idx").on(t.sourceCount.desc()),
  ],
);

// ---------------------------------------------------------------------------
// article_duplicates — other outlets carrying a story we already have.
// Kept rather than discarded: corroboration raises credibility now and becomes
// the clustering input in Section 4.
// ---------------------------------------------------------------------------
export const articleDuplicates = pgTable(
  "article_duplicates",
  {
    id: serial("id").primaryKey(),
    articleId: uuid("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    sourceId: integer("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    url: text("url").notNull().unique(),
    title: text("title"),
    publisherDomain: text("publisher_domain"),
    similarity: real("similarity"),
    seenAt: timestamp("seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("article_duplicates_article_idx").on(t.articleId)],
);

// ---------------------------------------------------------------------------
// retired_sources — stock feeds the user has deliberately removed.
//
// Without this, `db:seed` resurrects them: the registry is the source of truth
// for what *exists*, so a deleted stock feed comes straight back on the next
// seed, along with everything it ingests. Deleting is a decision and has to
// outlive a re-seed.
// ---------------------------------------------------------------------------
export const retiredSources = pgTable("retired_sources", {
  slug: text("slug").primaryKey(),
  name: text("name"),
  retiredAt: timestamp("retired_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ---------------------------------------------------------------------------
// ingest_runs — per-source poll history, for health and debugging.
// ---------------------------------------------------------------------------
export const ingestRuns = pgTable(
  "ingest_runs",
  {
    id: serial("id").primaryKey(),
    sourceId: integer("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    ranAt: timestamp("ran_at", { withTimezone: true }).notNull().defaultNow(),
    ok: boolean("ok").notNull(),
    itemsSeen: integer("items_seen").notNull().default(0),
    itemsNew: integer("items_new").notNull().default(0),
    itemsDuplicate: integer("items_duplicate").notNull().default(0),
    durationMs: integer("duration_ms"),
    error: text("error"),
  },
  (t) => [index("ingest_runs_ran_at_idx").on(t.ranAt.desc())],
);

export type Source = typeof sources.$inferSelect;
export type NewSource = typeof sources.$inferInsert;
export type Article = typeof articles.$inferSelect;
export type NewArticle = typeof articles.$inferInsert;
export type Org = typeof orgs.$inferSelect;
