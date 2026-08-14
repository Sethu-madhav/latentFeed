CREATE TABLE "model_mentions" (
	"model_slug" text NOT NULL,
	"article_id" uuid NOT NULL,
	CONSTRAINT "model_mentions_model_slug_article_id_pk" PRIMARY KEY("model_slug","article_id")
);
--> statement-breakpoint
CREATE TABLE "models" (
	"slug" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"family" text NOT NULL,
	"org_slug" text,
	"status" text DEFAULT 'rumoured' NOT NULL,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"released_at" timestamp with time zone,
	"mention_count" integer DEFAULT 0 NOT NULL,
	"source_count" integer DEFAULT 0 NOT NULL,
	"top_credibility" smallint DEFAULT 1 NOT NULL,
	"lead_article_id" uuid
);
--> statement-breakpoint
ALTER TABLE "model_mentions" ADD CONSTRAINT "model_mentions_model_slug_models_slug_fk" FOREIGN KEY ("model_slug") REFERENCES "public"."models"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_mentions" ADD CONSTRAINT "model_mentions_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "models" ADD CONSTRAINT "models_org_slug_orgs_slug_fk" FOREIGN KEY ("org_slug") REFERENCES "public"."orgs"("slug") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "model_mentions_article_idx" ON "model_mentions" USING btree ("article_id");--> statement-breakpoint
CREATE INDEX "models_status_idx" ON "models" USING btree ("status");--> statement-breakpoint
CREATE INDEX "models_last_seen_idx" ON "models" USING btree ("last_seen_at" DESC NULLS LAST);