/**
 * Loads .env for the non-Next.js entrypoints (worker, drizzle-kit, seed, CLI).
 * Next.js loads .env itself, so importing this from web code is a harmless no-op.
 */
import { config } from "dotenv";

config({ path: ".env", quiet: true });

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required env var ${name}. Copy .env.example to .env and fill it in.`,
    );
  }
  return value;
}

export const env = {
  get databaseUrl() {
    return required("DATABASE_URL");
  },
  userAgent:
    process.env.INGEST_USER_AGENT ??
    "latentFeed/0.1 (+https://github.com/latentfeed)",
  pollCron: process.env.POLL_CRON ?? "*/30 * * * *",
  enrichCron: process.env.ENRICH_CRON ?? "*/10 * * * *",
  workerPort: Number(process.env.WORKER_PORT ?? 8788),
  disableIngest: process.env.DISABLE_INGEST === "1",

  // --- OpenAI -------------------------------------------------------------
  // Everything below is optional. With no key the app runs exactly as it did
  // in Sections 1–2: heuristic enrichment and title-similarity dedup.
  openaiApiKey: process.env.OPENAI_API_KEY?.trim() || null,
  /** Chat model for the enrichment pass. */
  enrichmentModel: process.env.OPENAI_ENRICHMENT_MODEL ?? "gpt-5-mini",
  /** 1536 dims, which is what the articles.embedding column is declared as. */
  embeddingModel: process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small",
  disableLlm: process.env.DISABLE_LLM === "1",
  disableEmbeddings: process.env.DISABLE_EMBEDDINGS === "1",
  /** Articles per enrichment cycle — the main cost dial. */
  enrichBatchSize: Number(process.env.ENRICH_BATCH_SIZE ?? 40),
};

/** True when LLM enrichment can actually run. */
export function llmEnabled(): boolean {
  return Boolean(env.openaiApiKey) && !env.disableLlm;
}

/** True when embeddings can actually run. */
export function embeddingsEnabled(): boolean {
  return Boolean(env.openaiApiKey) && !env.disableEmbeddings;
}
