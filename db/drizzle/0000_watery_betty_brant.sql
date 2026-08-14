CREATE TABLE "article_duplicates" (
	"id" serial PRIMARY KEY NOT NULL,
	"article_id" uuid NOT NULL,
	"source_id" integer NOT NULL,
	"url" text NOT NULL,
	"title" text,
	"publisher_domain" text,
	"similarity" real,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "article_duplicates_url_unique" UNIQUE("url")
);
--> statement-breakpoint
CREATE TABLE "articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" integer NOT NULL,
	"url" text NOT NULL,
	"canonical_url" text NOT NULL,
	"publisher_domain" text,
	"title" text NOT NULL,
	"author" text,
	"published_at" timestamp with time zone NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"summary" text,
	"raw_content_truncated" text,
	"category" text DEFAULT 'other' NOT NULL,
	"credibility" smallint NOT NULL,
	"credibility_reason" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_rumour" boolean DEFAULT false NOT NULL,
	"impact" smallint DEFAULT 0 NOT NULL,
	"org_slugs" text[] DEFAULT '{}'::text[] NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"corroboration_count" integer DEFAULT 0 NOT NULL,
	"embedding" vector(1536),
	"embedding_model" text,
	"enriched_by" text DEFAULT 'heuristic' NOT NULL,
	"lang" text DEFAULT 'en' NOT NULL,
	CONSTRAINT "articles_url_unique" UNIQUE("url")
);
--> statement-breakpoint
CREATE TABLE "ingest_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_id" integer NOT NULL,
	"ran_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ok" boolean NOT NULL,
	"items_seen" integer DEFAULT 0 NOT NULL,
	"items_new" integer DEFAULT 0 NOT NULL,
	"items_duplicate" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "orgs" (
	"slug" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"kind" text DEFAULT 'lab' NOT NULL,
	"domains" text[] DEFAULT '{}'::text[] NOT NULL,
	"accent" text DEFAULT '#8b8b8b' NOT NULL,
	"sort_order" smallint DEFAULT 100 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"url" text,
	"feed_url" text,
	"kind" text DEFAULT 'rss' NOT NULL,
	"category" text DEFAULT 'press' NOT NULL,
	"base_credibility" smallint NOT NULL,
	"org_slug" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"muted_at" timestamp with time zone,
	"poll_minutes" integer DEFAULT 30 NOT NULL,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"disabled_reason" text,
	"last_polled_at" timestamp with time zone,
	"etag" text,
	"last_modified" text,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sources_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "article_duplicates" ADD CONSTRAINT "article_duplicates_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_duplicates" ADD CONSTRAINT "article_duplicates_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingest_runs" ADD CONSTRAINT "ingest_runs_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_org_slug_orgs_slug_fk" FOREIGN KEY ("org_slug") REFERENCES "public"."orgs"("slug") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "article_duplicates_article_idx" ON "article_duplicates" USING btree ("article_id");--> statement-breakpoint
CREATE INDEX "articles_published_idx" ON "articles" USING btree ("published_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "articles_category_idx" ON "articles" USING btree ("category");--> statement-breakpoint
CREATE INDEX "articles_credibility_idx" ON "articles" USING btree ("credibility");--> statement-breakpoint
CREATE INDEX "articles_source_idx" ON "articles" USING btree ("source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "articles_canonical_url_idx" ON "articles" USING btree ("canonical_url");--> statement-breakpoint
CREATE INDEX "articles_orgs_idx" ON "articles" USING gin ("org_slugs");--> statement-breakpoint
CREATE INDEX "articles_tags_idx" ON "articles" USING gin ("tags");--> statement-breakpoint
CREATE INDEX "articles_search_idx" ON "articles" USING gin ((
        setweight(to_tsvector('english', "title"), 'A') ||
        setweight(to_tsvector('english', coalesce("summary", '')), 'B')
      ));--> statement-breakpoint
CREATE INDEX "ingest_runs_ran_at_idx" ON "ingest_runs" USING btree ("ran_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "sources_enabled_idx" ON "sources" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX "sources_kind_idx" ON "sources" USING btree ("kind");