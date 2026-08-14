import "@/lib/env";
import { eq } from "drizzle-orm";
import { db, sql as client } from "@/db/client";
import { articles, sources, type CredibilityReason } from "@/db/schema";
import { scoreCredibility } from "@/lib/enrich/credibility";

/**
 * Re-run the credibility scorer over every article using the current rules.
 *
 * Needed whenever the publisher tier table or a scoring rule changes: scores
 * are computed at write time, so existing rows keep whatever the rules said
 * when they were ingested. Costs nothing — no model calls, everything it
 * needs is already stored.
 *
 *   npm run rescore
 */

/**
 * Recover the LLM's claim judgment from the reasons it recorded.
 *
 * The judgment isn't stored as its own column; it survives as the rule that
 * fired, which is enough to reproduce the same adjustment. Rows never seen by
 * the LLM simply have neither rule and score as before.
 */
function claimStatusFrom(
  reasons: CredibilityReason[],
): { claimStatus: "confirmed" | "reported" | "unconfirmed"; statusReason: string } | undefined {
  const unconfirmed = reasons.find((r) => r.rule === "llm-unconfirmed");
  if (unconfirmed) {
    return { claimStatus: "unconfirmed", statusReason: unconfirmed.detail ?? "" };
  }
  const confirmed = reasons.find((r) => r.rule === "llm-confirmed");
  if (confirmed) {
    return { claimStatus: "confirmed", statusReason: confirmed.detail ?? "" };
  }
  return undefined;
}

async function main() {
  const rows = await db
    .select({
      id: articles.id,
      title: articles.title,
      summary: articles.summary,
      url: articles.url,
      author: articles.author,
      publisherDomain: articles.publisherDomain,
      corroborationCount: articles.corroborationCount,
      credibility: articles.credibility,
      credibilityReason: articles.credibilityReason,
      baseCredibility: sources.baseCredibility,
    })
    .from(articles)
    .innerJoin(sources, eq(sources.id, articles.sourceId));

  console.log(`re-scoring ${rows.length} articles`);

  let changed = 0;
  const movement = new Map<string, number>();

  for (const row of rows) {
    const rescored = scoreCredibility({
      title: row.title,
      summary: row.summary,
      url: row.url,
      baseCredibility: row.baseCredibility,
      publisherDomain: row.publisherDomain,
      author: row.author,
      hasPublishDate: true,
      corroborationCount: row.corroborationCount,
      llm: claimStatusFrom(row.credibilityReason),
    });

    if (rescored.score === row.credibility) continue;

    const key = `${row.credibility} → ${rescored.score}`;
    movement.set(key, (movement.get(key) ?? 0) + 1);

    await db
      .update(articles)
      .set({
        credibility: rescored.score,
        credibilityReason: rescored.reasons,
        isRumour: rescored.isRumour,
      })
      .where(eq(articles.id, row.id));

    changed++;
  }

  console.log(`\n${changed} scores changed`);
  for (const [move, count] of [...movement].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${move.padEnd(8)} ${count}`);
  }

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
