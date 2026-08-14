CREATE TABLE "stories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"headline" text NOT NULL,
	"summary" text,
	"category" text DEFAULT 'other' NOT NULL,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_updated_at" timestamp with time zone NOT NULL,
	"article_count" integer DEFAULT 0 NOT NULL,
	"source_count" integer DEFAULT 0 NOT NULL,
	"top_credibility" smallint DEFAULT 1 NOT NULL,
	"max_impact" smallint DEFAULT 0 NOT NULL,
	"org_slugs" text[] DEFAULT '{}'::text[] NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"centroid" vector(1536),
	"embedding_model" text,
	"clustered_by" text DEFAULT 'title' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "story_id" uuid;--> statement-breakpoint
CREATE INDEX "stories_last_updated_idx" ON "stories" USING btree ("last_updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "stories_source_count_idx" ON "stories" USING btree ("source_count" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "articles_story_idx" ON "articles" USING btree ("story_id");