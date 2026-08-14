import "@/lib/env";
import { desc } from "drizzle-orm";
import { db, sql as client } from "@/db/client";
import { stories } from "@/db/schema";
import { runClusterCycle } from "./cluster";

/** One clustering pass over the recent window: npm run cluster:once */
async function main() {
  const started = Date.now();
  const summary = await runClusterCycle();

  console.log(
    `scanned ${summary.scanned} articles · ${summary.stories} stories · ` +
      `${summary.articlesClustered} clustered · ${summary.rescored} re-scored · ` +
      `${Date.now() - started}ms`,
  );

  const top = await db
    .select({
      headline: stories.headline,
      sourceCount: stories.sourceCount,
      articleCount: stories.articleCount,
      credibility: stories.topCredibility,
      by: stories.clusteredBy,
    })
    .from(stories)
    .orderBy(desc(stories.sourceCount))
    .limit(8);

  if (top.length > 0) {
    console.log("\ntop stories by independent coverage:");
    for (const s of top) {
      console.log(
        `  ${String(s.sourceCount).padStart(2)} sources · ${s.articleCount} articles · cred ${s.credibility} · ${s.by}  ${s.headline.slice(0, 62)}`,
      );
    }
  }

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
