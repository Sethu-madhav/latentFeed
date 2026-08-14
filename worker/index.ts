import "@/lib/env";
import { createServer } from "node:http";
import cron from "node-cron";
import { sql } from "@/db/client";
import { env } from "@/lib/env";
import { runCycle } from "./ingest";

let running = false;
let lastRunAt: Date | null = null;
let lastSummary: { polled: number; inserted: number; failed: number } | null =
  null;

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

async function shutdown(signal: string): Promise<void> {
  console.log(`\n${signal} — shutting down`);
  health.close();
  await sql.end({ timeout: 5 });
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
