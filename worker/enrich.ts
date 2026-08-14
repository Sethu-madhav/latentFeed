import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { articles, sources } from "@/db/schema";
import { scoreCredibility } from "@/lib/enrich/credibility";
import { enrichWithLlm, type EnrichCandidate } from "@/lib/enrich/llm";
import { scoreImpact } from "@/lib/enrich";
import { isCaseStudy } from "@/lib/enrich/classify";
import { env, llmEnabled } from "@/lib/env";
import { OpenAIFatalError } from "@/lib/llm/openai";

/**
 * Source kinds excluded from the LLM pass.
 *
 * arXiv is several hundred rows a day whose titles and abstracts are already
 * clean, structured and correctly categorised by the `isPaper` hint — paying
 * to re-describe them buys nothing. They still get embeddings, so semantic
 * dedup and Section 4 clustering cover them.
 */
const SKIP_KINDS = ["arxiv"] as const;

export interface EnrichSummary {
  processed: number;
  failed: number;
  promptTokens: number;
  completionTokens: number;
  stoppedEarly?: string;
}

/**
 * Rows still carrying heuristic-only enrichment, newest first.
 *
 * Newest-first matters: if the backlog is bigger than the budget, the articles
 * a reader is actually looking at get upgraded first.
 */
export async function pendingArticles(limit: number) {
  return db
    .select({
      id: articles.id,
      title: articles.title,
      summary: articles.summary,
      rawContentTruncated: articles.rawContentTruncated,
      url: articles.url,
      publisherDomain: articles.publisherDomain,
      author: articles.author,
      corroborationCount: articles.corroborationCount,
      sourceName: sources.name,
      sourceBaseCredibility: sources.baseCredibility,
      sourceOrgSlug: sources.orgSlug,
    })
    .from(articles)
    .innerJoin(sources, eq(sources.id, articles.sourceId))
    .where(
      and(
        eq(articles.enrichedBy, "heuristic"),
        sql`${sources.kind} not in ${SKIP_KINDS}`,
      ),
    )
    .orderBy(desc(articles.publishedAt))
    .limit(limit);
}

/**
 * Upgrade a batch of heuristic rows with the LLM pass.
 *
 * Each article is independent, so one bad response doesn't abort the batch —
 * except for auth and billing failures, which will fail identically for every
 * remaining row and so stop the cycle immediately.
 */
export async function runEnrichCycle(
  limit = env.enrichBatchSize,
): Promise<EnrichSummary> {
  const summary: EnrichSummary = {
    processed: 0,
    failed: 0,
    promptTokens: 0,
    completionTokens: 0,
  };

  if (!llmEnabled()) {
    return { ...summary, stoppedEarly: "LLM disabled or no OPENAI_API_KEY" };
  }

  const pending = await pendingArticles(limit);

  for (const row of pending) {
    const candidate: EnrichCandidate = {
      title: row.title,
      // Prefer the fuller captured body over the display summary.
      summary: row.rawContentTruncated ?? row.summary,
      url: row.url,
      sourceName: row.sourceName,
      publisherDomain: row.publisherDomain,
    };

    try {
      const { enrichment, promptTokens, completionTokens } =
        await enrichWithLlm(candidate);

      summary.promptTokens += promptTokens;
      summary.completionTokens += completionTokens;

      // Re-score with the model's claim reading folded in as a recorded rule.
      const rescored = scoreCredibility({
        title: row.title,
        summary: enrichment.summary || row.summary,
        url: row.url,
        baseCredibility: row.sourceBaseCredibility,
        publisherDomain: row.publisherDomain,
        author: row.author,
        hasPublishDate: true,
        corroborationCount: row.corroborationCount,
        llm: {
          claimStatus: enrichment.claimStatus,
          statusReason: enrichment.statusReason,
        },
      });

      // Keep the feed's own org if the model dropped it; a single-company feed
      // knows something the text alone doesn't.
      const orgSlugs = [
        ...new Set(
          row.sourceOrgSlug
            ? [...enrichment.orgSlugs, row.sourceOrgSlug]
            : enrichment.orgSlugs,
        ),
      ];

      await db
        .update(articles)
        .set({
          summary: enrichment.summary || row.summary,
          category: enrichment.category,
          tags: enrichment.tags,
          orgSlugs,
          credibility: rescored.score,
          credibilityReason: rescored.reasons,
          isRumour: rescored.isRumour,
          impact: scoreImpact({
            category: enrichment.category,
            credibility: rescored.score,
            orgSlugs,
            corroborationCount: row.corroborationCount,
            meta: {},
            isCaseStudy: isCaseStudy(row.title, enrichment.summary),
          }),
          enrichedBy: "llm",
          enrichedAt: new Date(),
        })
        .where(eq(articles.id, row.id));

      summary.processed++;
    } catch (err) {
      if (err instanceof OpenAIFatalError) {
        return { ...summary, stoppedEarly: err.message };
      }
      summary.failed++;
      console.warn(
        `[enrich] ${row.id} failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  return summary;
}

/** How many rows are still waiting, for reporting. */
export async function pendingCount(): Promise<number> {
  const [row] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(articles)
    .innerJoin(sources, eq(sources.id, articles.sourceId))
    .where(
      and(
        eq(articles.enrichedBy, "heuristic"),
        sql`${sources.kind} not in ${SKIP_KINDS}`,
      ),
    );
  return Number(row?.value ?? 0);
}
