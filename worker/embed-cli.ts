import "@/lib/env";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { db, sql as client } from "@/db/client";
import { articles } from "@/db/schema";
import {
  currentEmbeddingModel,
  embedItems,
  embeddingText,
} from "@/lib/embeddings";
import { embeddingsEnabled, env } from "@/lib/env";
import { OpenAIFatalError } from "@/lib/llm/openai";

/**
 * Backfill embeddings for rows that have none, or whose vector came from a
 * different model than the one now configured.
 *
 * The second case matters: vectors from different models aren't comparable, so
 * after switching OPENAI_EMBEDDING_MODEL the old rows are invisible to dedup
 * until they're re-embedded.
 *
 *   npm run embed:backfill        # one batch
 *   npm run embed:backfill all    # drain
 */
const BATCH = 200;

async function main() {
  if (!embeddingsEnabled()) {
    console.log(
      "Embeddings are off — set OPENAI_API_KEY in .env (and leave DISABLE_EMBEDDINGS unset).",
    );
    await client.end();
    return;
  }

  const model = currentEmbeddingModel();
  const drain = process.argv[2] === "all";

  const needsEmbedding = or(
    isNull(articles.embedding),
    sql`${articles.embeddingModel} is distinct from ${model}`,
  );

  const [{ value: total }] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(articles)
    .where(needsEmbedding);

  console.log(`${total} articles need embedding with ${model}`);
  if (total === 0) {
    await client.end();
    return;
  }

  let done = 0;

  for (;;) {
    const rows = await db
      .select({
        id: articles.id,
        title: articles.title,
        summary: articles.summary,
      })
      .from(articles)
      .where(needsEmbedding)
      .orderBy(desc(articles.publishedAt))
      .limit(BATCH);

    if (rows.length === 0) break;

    try {
      const embedded = await embedItems(rows, (r) =>
        embeddingText(r.title, r.summary),
      );

      let wrote = 0;
      for (const { item, embedding } of embedded) {
        if (!embedding) continue;
        await db
          .update(articles)
          .set({ embedding, embeddingModel: model })
          .where(eq(articles.id, item.id));
        wrote++;
      }

      done += wrote;
      console.log(`  embedded ${wrote}/${rows.length} (${done}/${total})`);

      // Nothing was written, so the next query returns the same rows.
      if (wrote === 0) {
        console.warn("  batch produced no vectors — stopping to avoid a loop");
        break;
      }
    } catch (err) {
      if (err instanceof OpenAIFatalError) {
        console.error(`stopped: ${err.message}`);
        break;
      }
      throw err;
    }

    if (!drain) break;
  }

  console.log(`\nembedded ${done} articles with ${model}`);
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
