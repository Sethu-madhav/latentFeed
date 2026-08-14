import { env, embeddingsEnabled } from "@/lib/env";
import { OpenAIFatalError, embedBatch } from "@/lib/llm/openai";

/** The dimension the articles.embedding column is declared with. */
export const EMBEDDING_DIMS = 1536;

/**
 * How much of an article gets embedded. Titles carry most of the signal for
 * "is this the same story"; a long body dilutes it and costs more.
 */
const EMBED_CHAR_LIMIT = 1200;

/** Max inputs per request, to keep any single call small enough to retry. */
const BATCH_SIZE = 64;

/**
 * Set once a fatal auth/billing failure is seen, so a long-lived worker
 * doesn't log the same error for all 49 sources on every cycle. Cleared only
 * by a restart, which is also when a fixed key would be picked up.
 */
let fatalNotice: string | null = null;

/** Exposed for the health endpoint and tests. */
export function embeddingHalt(): string | null {
  return fatalNotice;
}

export function resetEmbeddingHalt(): void {
  fatalNotice = null;
}

export interface EmbeddedItem<T> {
  item: T;
  embedding: number[] | null;
}

/** The text an article is embedded as. */
export function embeddingText(title: string, summary?: string | null): string {
  return `${title}\n\n${summary ?? ""}`.slice(0, EMBED_CHAR_LIMIT).trim();
}

/**
 * Embed items, returning them paired with their vectors in the original order.
 *
 * Returns null vectors rather than throwing when embeddings are switched off
 * or the call fails: dedup falls back to title similarity, and a failed
 * embedding must never cost us the article.
 */
export async function embedItems<T>(
  items: T[],
  toText: (item: T) => string,
): Promise<EmbeddedItem<T>[]> {
  if (items.length === 0) return [];

  // Already known to be unusable this process — skip straight to the fallback.
  if (!embeddingsEnabled() || fatalNotice) {
    return items.map((item) => ({ item, embedding: null }));
  }

  const results: EmbeddedItem<T>[] = [];

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const slice = items.slice(i, i + BATCH_SIZE);
    const inputs = slice.map((item) => toText(item) || " ");

    try {
      const { vectors } = await embedBatch(inputs);
      slice.forEach((item, n) => {
        const embedding = vectors[n];
        results.push({
          item,
          embedding:
            embedding?.length === EMBEDDING_DIMS ? embedding : null,
        });
      });
    } catch (err) {
      // Degrade to no embeddings rather than losing the items.
      console.warn(
        `[embeddings] batch failed, falling back to title dedup: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      slice.forEach((item) => results.push({ item, embedding: null }));

      // A bad key or an unfunded account fails identically for every
      // remaining batch, so stop rather than repeating the same call.
      if (err instanceof OpenAIFatalError) {
        fatalNotice = err.message;
        console.warn(
          "[embeddings] disabled for this process — restart after fixing the key or billing",
        );
        for (const item of items.slice(i + BATCH_SIZE)) {
          results.push({ item, embedding: null });
        }
        break;
      }
    }
  }

  return results;
}

/** The model string stored alongside each vector. */
export function currentEmbeddingModel(): string {
  return env.embeddingModel;
}

/**
 * Cosine similarity of two equal-length vectors, in [-1, 1].
 *
 * Only used in tests and for explaining a match; the ingest path compares in
 * Postgres so pgvector's index does the work.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Cosine distance above which two articles are *not* the same story.
 *
 * pgvector's `<=>` returns distance (1 − similarity), so this is the value
 * compared against directly. 0.12 distance ≈ 0.88 similarity, which in
 * practice separates "same launch, different outlet" from "both about Gemini".
 */
export const SEMANTIC_DUPLICATE_DISTANCE = 0.12;
