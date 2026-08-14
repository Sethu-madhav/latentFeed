import "@/lib/env";
import { desc } from "drizzle-orm";
import { db, sql as client } from "@/db/client";
import { models } from "@/db/schema";
import { runRadarCycle } from "./radar";

/** Rebuild the model radar: npm run radar:once */
async function main() {
  const started = Date.now();
  const summary = await runRadarCycle();

  console.log(
    `scanned ${summary.scanned} articles · ${summary.models} models · ` +
      `${summary.mentions} mentions · ${Date.now() - started}ms`,
  );
  console.log(
    `  released ${summary.byStatus.released} · confirmed ${summary.byStatus.confirmed} · ` +
      `reported ${summary.byStatus.reported} · rumoured ${summary.byStatus.rumoured}`,
  );

  const top = await db
    .select({
      name: models.name,
      status: models.status,
      org: models.orgSlug,
      mentions: models.mentionCount,
      sources: models.sourceCount,
      cred: models.topCredibility,
    })
    .from(models)
    .orderBy(desc(models.mentionCount))
    .limit(12);

  console.log("\nmost-discussed models:");
  for (const m of top) {
    console.log(
      `  ${m.status.padEnd(9)} ${String(m.mentions).padStart(3)} mentions · ` +
        `${String(m.sources).padStart(2)} outlets · cred ${m.cred}  ${m.name} (${m.org})`,
    );
  }

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
