import "@/lib/env";
import { sql } from "@/db/client";
import { env, llmEnabled } from "@/lib/env";
import { pendingCount, runEnrichCycle } from "./enrich";

/**
 * Manual enrichment backfill:
 *   npm run enrich:once           # one batch (ENRICH_BATCH_SIZE)
 *   npm run enrich:once 200       # a specific number
 *   npm run enrich:once all       # drain the backlog, batch by batch
 */
async function main() {
  const arg = process.argv[2];
  const drain = arg === "all";
  const limit = drain ? env.enrichBatchSize : Number(arg) || env.enrichBatchSize;

  if (!llmEnabled()) {
    console.log(
      "LLM enrichment is off — set OPENAI_API_KEY in .env (and leave DISABLE_LLM unset).",
    );
    await sql.end();
    return;
  }

  const before = await pendingCount();
  console.log(
    `${before} articles pending · model ${env.enrichmentModel} · batch ${limit}`,
  );

  let processed = 0;
  let failed = 0;
  let promptTokens = 0;
  let completionTokens = 0;

  for (;;) {
    const summary = await runEnrichCycle(limit);
    processed += summary.processed;
    failed += summary.failed;
    promptTokens += summary.promptTokens;
    completionTokens += summary.completionTokens;

    console.log(
      `  batch: ${summary.processed} enriched, ${summary.failed} failed` +
        (summary.stoppedEarly ? ` — stopped: ${summary.stoppedEarly}` : ""),
    );

    if (summary.stoppedEarly) break;
    if (!drain || summary.processed === 0) break;
  }

  const after = await pendingCount();
  console.log(
    `\nenriched ${processed} · failed ${failed} · pending ${after}` +
      `\ntokens: ${promptTokens} in, ${completionTokens} out`,
  );

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
