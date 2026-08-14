import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { articles, modelMentions, models, sources } from "@/db/schema";
import {
  deriveStatus,
  extractModels,
  type ModelStatus,
} from "@/lib/enrich/models";
import { firstPartyOrg } from "@/lib/orgs";

/** How far back the radar looks. Models older than this have settled. */
const WINDOW_DAYS = 45;

export interface RadarSummary {
  scanned: number;
  models: number;
  mentions: number;
  byStatus: Record<ModelStatus, number>;
}

interface Accumulator {
  slug: string;
  name: string;
  family: string;
  orgSlug: string;
  firstSeenAt: Date;
  lastSeenAt: Date;
  releasedAt: Date | null;
  mentions: string[];
  outlets: Set<string>;
  topCredibility: number;
  hasFirstPartyRelease: boolean;
  leadArticleId: string;
  leadScore: number;
}

/**
 * Rebuild the model radar from scratch over the recent window.
 *
 * A full recompute rather than an incremental update, for the same reason
 * clustering is: a late article can change a model's status, and recomputing
 * is cheap enough that a correct answer beats a path-dependent one.
 */
export async function runRadarCycle(): Promise<RadarSummary> {
  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000);

  const rows = await db
    .select({
      id: articles.id,
      title: articles.title,
      summary: articles.summary,
      url: articles.url,
      publishedAt: articles.publishedAt,
      credibility: articles.credibility,
      category: articles.category,
      publisherDomain: articles.publisherDomain,
      sourceId: articles.sourceId,
      sourceKind: sources.kind,
    })
    .from(articles)
    .innerJoin(sources, eq(sources.id, articles.sourceId))
    .where(gte(articles.publishedAt, since))
    .orderBy(articles.publishedAt);

  const acc = new Map<string, Accumulator>();

  for (const row of rows) {
    // Title plus the lede only. A full body name-drops every model a piece
    // compares against, which would credit each of them with a mention.
    const text = `${row.title}\n${row.summary?.slice(0, 300) ?? ""}`;

    for (const model of extractModels(text)) {
      const outlet = row.publisherDomain ?? `source:${row.sourceId}`;

      // Weights on the lab's own Hugging Face account, or the lab's own site,
      // are proof of release. Reporting about a release never is.
      const firstParty =
        row.sourceKind === "hf_models" ||
        firstPartyOrg(row.url) === model.orgSlug;

      const existing = acc.get(model.slug);
      if (!existing) {
        acc.set(model.slug, {
          ...model,
          firstSeenAt: row.publishedAt,
          lastSeenAt: row.publishedAt,
          releasedAt: firstParty ? row.publishedAt : null,
          mentions: [row.id],
          outlets: new Set([outlet]),
          topCredibility: row.credibility,
          hasFirstPartyRelease: firstParty,
          leadArticleId: row.id,
          leadScore: leadScore(row.credibility, row.category),
        });
        continue;
      }

      existing.mentions.push(row.id);
      existing.outlets.add(outlet);
      existing.topCredibility = Math.max(existing.topCredibility, row.credibility);
      if (row.publishedAt < existing.firstSeenAt) {
        existing.firstSeenAt = row.publishedAt;
      }
      if (row.publishedAt > existing.lastSeenAt) {
        existing.lastSeenAt = row.publishedAt;
      }
      if (firstParty) {
        existing.hasFirstPartyRelease = true;
        if (!existing.releasedAt || row.publishedAt < existing.releasedAt) {
          existing.releasedAt = row.publishedAt;
        }
      }

      const score = leadScore(row.credibility, row.category);
      if (score > existing.leadScore) {
        existing.leadScore = score;
        existing.leadArticleId = row.id;
      }
    }
  }

  // Rebuild: mentions cascade from models, so clearing models clears both.
  await db.delete(models);

  const byStatus: Record<ModelStatus, number> = {
    rumoured: 0,
    reported: 0,
    confirmed: 0,
    released: 0,
  };
  let mentionRows = 0;

  for (const model of acc.values()) {
    const status = deriveStatus({
      hasFirstPartyRelease: model.hasFirstPartyRelease,
      topCredibility: model.topCredibility,
      sourceCount: model.outlets.size,
    });
    byStatus[status]++;

    await db.insert(models).values({
      slug: model.slug,
      name: model.name,
      family: model.family,
      orgSlug: model.orgSlug,
      status,
      firstSeenAt: model.firstSeenAt,
      lastSeenAt: model.lastSeenAt,
      releasedAt: model.releasedAt,
      mentionCount: model.mentions.length,
      sourceCount: model.outlets.size,
      topCredibility: model.topCredibility,
      leadArticleId: model.leadArticleId,
    });

    const unique = [...new Set(model.mentions)];
    for (let i = 0; i < unique.length; i += 200) {
      await db
        .insert(modelMentions)
        .values(
          unique.slice(i, i + 200).map((articleId) => ({
            modelSlug: model.slug,
            articleId,
          })),
        )
        .onConflictDoNothing();
    }
    mentionRows += unique.length;
  }

  return {
    scanned: rows.length,
    models: acc.size,
    mentions: mentionRows,
    byStatus,
  };
}

/**
 * How well an article represents a model's current state. A well-sourced
 * launch piece beats a passing mention in a roundup.
 */
function leadScore(credibility: number, category: string): number {
  const categoryWeight =
    category === "model-launch" ? 6 : category === "model-leak" ? 4 : 0;
  return credibility * 2 + categoryWeight;
}

/** Models whose status changed most recently, for the radar view. */
export async function radarCounts(): Promise<Record<string, number>> {
  const rows = await db
    .select({ status: models.status, count: sql<number>`count(*)::int` })
    .from(models)
    .groupBy(models.status);

  return Object.fromEntries(rows.map((r) => [r.status, Number(r.count)]));
}
