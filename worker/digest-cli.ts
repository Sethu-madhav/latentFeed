import "@/lib/env";
import { sql as client } from "@/db/client";
import { runDigest } from "./digest";

/**
 * Write today's brief, or a specific day's:
 *   npm run digest:once
 *   npm run digest:once 2026-08-13
 */
async function main() {
  const arg = process.argv[2];
  const day = arg ? new Date(`${arg}T23:59:59Z`) : new Date();

  if (Number.isNaN(day.getTime())) {
    console.error(`invalid date: ${arg} (expected YYYY-MM-DD)`);
    process.exit(1);
  }

  const result = await runDigest(day);

  if (!result) {
    console.log(`no articles in the 24h before ${day.toISOString().slice(0, 10)}`);
  } else {
    console.log(
      `${day.toISOString().slice(0, 10)} · ${result.model} · ${result.articleIds.length} articles cited`,
    );
    console.log(`\n${result.title}\n`);
    console.log(result.bodyMarkdown.slice(0, 900));
  }

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
