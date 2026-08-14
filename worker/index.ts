import "@/lib/env";
import { createServer } from "node:http";
import cron from "node-cron";
import { sql } from "@/db/client";
import { embeddingHalt } from "@/lib/embeddings";
import { embeddingsEnabled, env, llmEnabled } from "@/lib/env";
import { pendingCount, runEnrichCycle } from "./enrich";
import { runCycle } from "./ingest";

let running = false;
let lastRunAt: Date | null = null;
let lastSummary: { polled: number; inserted: number; failed: number } | null =
  null;

let enriching = false;
let lastEnrichAt: Date | null = null;
let enrichHalted: string | null = null;

/** Run a cycle, guarding against overlap when one run outlasts the interval. */
async function tick(trigger: string): Promise<void> {
  if (running) {
    console.log(`[${trigger}] previous cycle still running — skipping`);
    return;
  }
  running = true;
  const startedAt = Date.now();

  try {
    const summary = await runCycle();
    lastRunAt = new Date();
    lastSummary = {
      polled: summary.polled,
      inserted: summary.inserted,
      failed: summary.failed,
    };
    console.log(
      `[${trigger}] polled ${summary.polled} · inserted ${summary.inserted} · duplicates ${summary.duplicates} · failed ${summary.failed} · ${Date.now() - startedAt}ms`,
    );
    for (const r of summary.results.filter((x) => !x.ok)) {
      console.warn(`  ✗ ${r.slug}: ${r.error?.slice(0, 120)}`);
    }
  } catch (err) {
    console.error(`[${trigger}] cycle failed`, err);
  } finally {
    running = false;
  }
}

/**
 * Upgrade a batch of heuristic rows.
 *
 * Runs on its own schedule rather than inside ingestion so a slow or failing
 * model can never delay or break the feed itself.
 */
async function enrichTick(): Promise<void> {
  if (enriching || !llmEnabled() || enrichHalted) return;
  enriching = true;

  try {
    const summary = await runEnrichCycle();
    lastEnrichAt = new Date();

    if (summary.processed > 0 || summary.failed > 0) {
      console.log(
        `[enrich] ${summary.processed} enriched · ${summary.failed} failed · ${await pendingCount()} pending`,
      );
    }

    // A billing or auth failure repeats for every row; stop trying until the
    // worker is restarted rather than logging the same error every 10 minutes.
    if (summary.stoppedEarly) {
      enrichHalted = summary.stoppedEarly;
      console.warn(`[enrich] halted: ${summary.stoppedEarly}`);
    }
  } catch (err) {
    console.error("[enrich] cycle failed", err);
  } finally {
    enriching = false;
  }
}

const health = createServer((req, res) => {
  if (req.url === "/healthz") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        running,
        lastRunAt: lastRunAt?.toISOString() ?? null,
        lastSummary,
        cron: env.pollCron,
        ingestDisabled: env.disableIngest,
        enrich: {
          enabled: llmEnabled(),
          running: enriching,
          lastRunAt: lastEnrichAt?.toISOString() ?? null,
          halted: enrichHalted,
          model: env.enrichmentModel,
        },
        embeddings: {
          enabled: embeddingsEnabled(),
          model: env.embeddingModel,
          halted: embeddingHalt(),
        },
      }),
    );
    return;
  }
  res.writeHead(404).end();
});

health.listen(env.workerPort, () => {
  console.log(`worker health on http://localhost:${env.workerPort}/healthz`);
});

if (env.disableIngest) {
  console.log("DISABLE_INGEST is set — polling is off");
} else {
  if (!cron.validate(env.pollCron)) {
    throw new Error(`invalid POLL_CRON: ${env.pollCron}`);
  }
  cron.schedule(env.pollCron, () => void tick("cron"));
  console.log(`polling on "${env.pollCron}"`);
  // Prime the feed immediately rather than waiting out the first interval.
  void tick("startup");
}

if (llmEnabled()) {
  if (!cron.validate(env.enrichCron)) {
    throw new Error(`invalid ENRICH_CRON: ${env.enrichCron}`);
  }
  cron.schedule(env.enrichCron, () => void enrichTick());
  console.log(
    `enrichment on "${env.enrichCron}" with ${env.enrichmentModel}`,
  );
} else {
  console.log("enrichment off (no OPENAI_API_KEY or DISABLE_LLM=1)");
}

async function shutdown(signal: string): Promise<void> {
  console.log(`\n${signal} — shutting down`);
  health.close();
  await sql.end({ timeout: 5 });
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
