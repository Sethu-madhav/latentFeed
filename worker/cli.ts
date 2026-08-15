import "@/lib/env";
import { sql } from "@/db/client";
import { runCycle } from "./ingest";

/**
 * One-shot ingestion, for iterating on a single feed:
 *   npm run ingest:once                 # every due source
 *   npm run ingest:once openai-news     # just this one, ignoring its throttle
 */
async function main() {
  const slugs = process.argv.slice(2).filter((a) => !a.startsWith("-"));

  console.log(
    slugs.length ? `ingesting: ${slugs.join(", ")}` : "ingesting all due sources",
  );

  const summary = await runCycle(slugs.length ? slugs : undefined);

  for (const r of summary.results) {
    if (!r.ok) {
      console.log(`  ✗ ${r.slug.padEnd(26)} ${r.error?.slice(0, 90)}`);
    } else if (r.skipped) {
      console.log(`  – ${r.slug.padEnd(26)} ${r.skipped}`);
    } else {
      console.log(
        `  ✓ ${r.slug.padEnd(26)} seen ${String(r.seen).padStart(3)}  new ${String(r.inserted).padStart(3)}  dup ${String(r.duplicates).padStart(3)}  known ${String(r.preFiltered).padStart(3)}  ${r.durationMs}ms`,
      );
    }
  }

  console.log(
    `\npolled ${summary.polled} · inserted ${summary.inserted} · duplicates ${summary.duplicates} · ` +
      `already known ${summary.preFiltered} (skipped before embedding) · failed ${summary.failed}`,
  );

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
