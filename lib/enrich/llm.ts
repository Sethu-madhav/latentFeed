import type { ArticleCategory } from "@/db/schema";
import { CATEGORY_ORDER } from "@/lib/enrich/classify";
import { ALL_ORGS } from "@/lib/orgs";
import { structuredCompletion } from "@/lib/llm/openai";
import { normalizeTag } from "./tags";

/**
 * How sure the model is that the article's central claim has actually
 * happened, as opposed to being anticipated, leaked or inferred.
 */
export type ClaimStatus = "confirmed" | "reported" | "unconfirmed";

export interface LlmEnrichment {
  summary: string;
  category: ArticleCategory;
  tags: string[];
  orgSlugs: string[];
  claimStatus: ClaimStatus;
  /** One clause explaining the claim status, shown in the credibility tooltip. */
  statusReason: string;
}

const ORG_SLUGS = ALL_ORGS.map((o) => o.slug);

const SYSTEM_PROMPT = `You classify AI-industry news for a feed that separates confirmed reporting from rumour.

Rules:
- summary: one or two plain sentences stating what actually happened. No hype, no "this article discusses". If the item is a research paper, say what it found.
- category: pick the single best fit.
- claim_status:
  - "confirmed" when the company itself announced it, shipped it, or published it (a first-party blog post, a release, a paper, a filing).
  - "reported" when a credible outlet reports it as fact but the company has not confirmed it.
  - "unconfirmed" when it is a leak, a datamined string, an anticipation, an unnamed-source claim, or speculation.
- status_reason: one short clause justifying claim_status, e.g. "OpenAI's own announcement post" or "based on datamined app strings".
- orgs: only companies that are actually a subject of the story, not ones mentioned in passing.
- tags: 2-6 short lowercase topic slugs, hyphenated, e.g. "open-weights", "reasoning", "datacenter".`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "category", "tags", "orgs", "claim_status", "status_reason"],
  properties: {
    summary: { type: "string" },
    category: { type: "string", enum: CATEGORY_ORDER },
    tags: { type: "array", items: { type: "string" } },
    orgs: { type: "array", items: { type: "string", enum: ORG_SLUGS } },
    claim_status: {
      type: "string",
      enum: ["confirmed", "reported", "unconfirmed"],
    },
    status_reason: { type: "string" },
  },
} as const;

interface RawResponse {
  summary: string;
  category: string;
  tags: string[];
  orgs: string[];
  claim_status: string;
  status_reason: string;
}

export interface EnrichCandidate {
  title: string;
  summary: string | null;
  url: string;
  sourceName: string;
  publisherDomain: string | null;
}

/** How much of the body the model sees. Enough for context, capped for cost. */
const BODY_LIMIT = 1500;

export interface LlmEnrichResult {
  enrichment: LlmEnrichment;
  promptTokens: number;
  completionTokens: number;
}

/** Run one article through the model and normalise what comes back. */
export async function enrichWithLlm(
  article: EnrichCandidate,
): Promise<LlmEnrichResult> {
  const user = [
    `Source: ${article.sourceName}`,
    article.publisherDomain ? `Publisher: ${article.publisherDomain}` : "",
    `URL: ${article.url}`,
    `Title: ${article.title}`,
    "",
    article.summary?.slice(0, BODY_LIMIT) ?? "(no body text)",
  ]
    .filter(Boolean)
    .join("\n");

  const { data, promptTokens, completionTokens } =
    await structuredCompletion<RawResponse>({
      system: SYSTEM_PROMPT,
      user,
      schemaName: "article_enrichment",
      schema: SCHEMA as unknown as Record<string, unknown>,
    });

  return {
    enrichment: normalizeResponse(data),
    promptTokens,
    completionTokens,
  };
}

/**
 * Coerce the model's output into our own vocabulary.
 *
 * `strict: true` guarantees the shape, but not that tags are well-formed or
 * that the category string is one we know, so both are re-validated here.
 */
export function normalizeResponse(raw: RawResponse): LlmEnrichment {
  const category = (CATEGORY_ORDER as string[]).includes(raw.category)
    ? (raw.category as ArticleCategory)
    : "other";

  const claimStatus: ClaimStatus =
    raw.claim_status === "confirmed" || raw.claim_status === "unconfirmed"
      ? raw.claim_status
      : "reported";

  const tags = [
    ...new Set(
      (raw.tags ?? [])
        .map((t) => normalizeTag(t))
        .filter((t): t is string => t !== null),
    ),
  ].slice(0, 8);

  const orgSlugs = [
    ...new Set((raw.orgs ?? []).filter((o) => ORG_SLUGS.includes(o))),
  ];

  return {
    summary: raw.summary?.trim() || "",
    category,
    tags,
    orgSlugs,
    claimStatus,
    statusReason: raw.status_reason?.trim().slice(0, 160) || "",
  };
}
