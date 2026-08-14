ALTER TABLE "articles" ADD COLUMN "enriched_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "articles_enriched_by_idx" ON "articles" USING btree ("enriched_by");--> statement-breakpoint
CREATE INDEX "articles_embedding_idx" ON "articles" USING hnsw ("embedding" vector_cosine_ops);