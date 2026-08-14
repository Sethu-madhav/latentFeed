import { and, desc, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { articles, digests, sources } from "@/db/schema";
import { env, llmEnabled } from "@/lib/env";
import { OpenAIFatalError, structuredCompletion } from "@/lib/llm/openai";

/** How many candidates the model sees. Enough to choose from, capped for cost. */
const CANDIDATE_LIMIT = 25;

/** Nothing below this is worth a reader's morning. */
const MIN_CREDIBILITY = 3;

export interface DigestCandidate {
  id: string;
  title: string;
  summary: string | null;
  url: string;
  category: string;
  credibility: number;
  impact: number;
  orgSlugs: string[];
  storyId: string | null;
  sourceName: string;
}

/**
 * Pick what the brief covers, before any model call.
 *
 * One article per story is the important rule: a launch covered by 21 outlets
 * would otherwise fill the whole digest with the same event.
 */
export async function selectCandidates(
  day: Date,
  limit = CANDIDATE_LIMIT,
): Promise<DigestCandidate[]> {
  const end = new Date(day);
  const start = new Date(end.getTime() - 24 * 3_600_000);

  const rows = await db
    .select({
      id: articles.id,
      title: articles.title,
      summary: articles.summary,
      url: articles.url,
      category: articles.category,
      credibility: articles.credibility,
      impact: articles.impact,
      orgSlugs: articles.orgSlugs,
      storyId: articles.storyId,
      sourceName: sources.name,
    })
    .from(articles)
    .innerJoin(sources, eq(sources.id, articles.sourceId))
    .where(
      and(
        gte(articles.publishedAt, start),
        lt(articles.publishedAt, end),
        gte(articles.credibility, MIN_CREDIBILITY),
        isNull(sources.mutedAt),
      ),
    )
    .orderBy(desc(articles.impact), desc(articles.credibility));

  return dedupeByStory(rows).slice(0, limit);
}

/** Keep the highest-impact article from each cluster; rows arrive pre-sorted. */
export function dedupeByStory<T extends { storyId: string | null }>(
  rows: T[],
): T[] {
  const seenStories = new Set<string>();
  const out: T[] = [];

  for (const row of rows) {
    if (row.storyId) {
      if (seenStories.has(row.storyId)) continue;
      seenStories.add(row.storyId);
    }
    out.push(row);
  }
  return out;
}

interface RawDigest {
  title: string;
  intro: string;
  items: { headline: string; body: string; article_ids: string[] }[];
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "intro", "items"],
  properties: {
    title: { type: "string" },
    intro: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["headline", "body", "article_ids"],
        properties: {
          headline: { type: "string" },
          body: { type: "string" },
          article_ids: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
} as const;

const SYSTEM_PROMPT = `You write a short daily briefing for someone who follows AI closely and has already seen the headlines they care about.

Rules:
- title: a plain summary of the day, under 60 characters. No "AI Daily" branding.
- intro: one sentence on the shape of the day. Say if it was quiet.
- items: 4 to 8, ordered by how much they matter. Merge related stories into one item.
- headline: what happened, stated plainly. Not the article's own headline verbatim.
- body: two or three sentences. What happened, and why it matters to someone tracking the labs. No filler, no "this article discusses", no hype.
- article_ids: the ids you drew on, copied exactly from the input.
- Skip vendor marketing and customer case studies entirely.
- If something is a rumour or unconfirmed, say so in the body.`;

export interface DigestResult {
  title: string;
  bodyMarkdown: string;
  model: string;
  articleIds: string[];
}

/**
 * Build the brief for a day.
 *
 * Falls back to a deterministic list when the model is unavailable — the same
 * principle as every other optional layer here: the feature degrades, it never
 * breaks the page.
 */
export async function buildDigest(day: Date): Promise<DigestResult | null> {
  const candidates = await selectCandidates(day);
  if (candidates.length === 0) return null;

  if (!llmEnabled()) return fallbackDigest(candidates);

  try {
    const { data } = await structuredCompletion<RawDigest>({
      system: SYSTEM_PROMPT,
      user: candidates
        .map(
          (c) =>
            `id: ${c.id}\n${c.category} · credibility ${c.credibility}/5 · ${c.sourceName}\n${c.title}\n${c.summary?.slice(0, 320) ?? ""}`,
        )
        .join("\n\n---\n\n"),
      schemaName: "daily_digest",
      schema: SCHEMA as unknown as Record<string, unknown>,
    });

    return renderDigest(data, candidates, env.enrichmentModel);
  } catch (err) {
    if (err instanceof OpenAIFatalError) {
      console.warn(`[digest] ${err.message} — writing the deterministic brief`);
      return fallbackDigest(candidates);
    }
    throw err;
  }
}

/**
 * Turn the model's response into markdown, dropping any citation that wasn't
 * in the candidate set — the brief must not reference an article we never
 * showed it.
 */
export function renderDigest(
  raw: RawDigest,
  candidates: DigestCandidate[],
  model: string,
): DigestResult {
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const cited = new Set<string>();

  const sections = raw.items.map((item) => {
    const links = (item.article_ids ?? [])
      .filter((id) => byId.has(id))
      .map((id) => {
        cited.add(id);
        const article = byId.get(id)!;
        return `- [${article.title}](${article.url}) — ${article.sourceName}`;
      });

    return [`### ${item.headline}`, "", item.body, "", ...links].join("\n");
  });

  return {
    title: raw.title.trim(),
    bodyMarkdown: [raw.intro.trim(), "", ...sections].join("\n").trim(),
    model,
    articleIds: [...cited],
  };
}

/** No model available: the top items by impact, stated plainly. */
export function fallbackDigest(candidates: DigestCandidate[]): DigestResult {
  const top = candidates.slice(0, 8);

  const body = top
    .map(
      (c) =>
        `### ${c.title}\n\n${c.summary?.slice(0, 240) ?? ""}\n\n- [${c.sourceName}](${c.url}) — credibility ${c.credibility}/5`,
    )
    .join("\n\n");

  return {
    title: `${top.length} things worth knowing`,
    bodyMarkdown: [
      "_Generated without a model — ranked by impact score._",
      "",
      body,
    ].join("\n"),
    model: "heuristic",
    articleIds: top.map((c) => c.id),
  };
}

/** Build and store the brief for a day, replacing any existing one. */
export async function runDigest(day = new Date()): Promise<DigestResult | null> {
  const result = await buildDigest(day);
  if (!result) return null;

  const dayKey = day.toISOString().slice(0, 10);

  await db
    .insert(digests)
    .values({
      day: dayKey,
      title: result.title,
      bodyMarkdown: result.bodyMarkdown,
      model: result.model,
      articleIds: result.articleIds,
    })
    .onConflictDoUpdate({
      target: digests.day,
      set: {
        title: sql`excluded.title`,
        bodyMarkdown: sql`excluded.body_markdown`,
        model: sql`excluded.model`,
        articleIds: sql`excluded.article_ids`,
        createdAt: sql`now()`,
      },
    });

  return result;
}
