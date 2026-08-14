import type { ArticleCategory, CredibilityReason } from "@/db/schema";
import type { FeedItem } from "@/lib/fetching/types";
import { PRIMARY_ORGS, matchOrgs } from "@/lib/orgs";
import { classify, isCaseStudy } from "./classify";
import { scoreCredibility } from "./credibility";
import { canonicalizeUrl } from "./dedup";
import { extractTags } from "./tags";

export * from "./classify";
export * from "./credibility";
export * from "./dedup";
export * from "./tags";

const PRIMARY_SLUGS = new Set(PRIMARY_ORGS.map((o) => o.slug));

/** How much of the body the classifier and tagger are allowed to see. */
const SNIPPET_LIMIT = 400;

export interface EnrichInput {
  item: FeedItem;
  baseCredibility: number;
  /** Set when the whole feed is about one company. */
  sourceOrgSlug?: string | null;
  /** Independent outlets already carrying this story. */
  corroborationCount?: number;
}

export interface EnrichedArticle {
  canonicalUrl: string;
  publisherDomain: string | null;
  category: ArticleCategory;
  orgSlugs: string[];
  tags: string[];
  credibility: number;
  credibilityReason: CredibilityReason[];
  isRumour: boolean;
  impact: number;
  summary: string | null;
}

/**
 * Run every heuristic over one feed item. No network, no API key, no cost —
 * this is what keeps the app fully functional before Section 3's LLM layer.
 */
export function enrich({
  item,
  baseCredibility,
  sourceOrgSlug,
  corroborationCount = 0,
}: EnrichInput): EnrichedArticle {
  const meta = item.meta ?? {};
  // Aggregators often set the description to the headline verbatim; showing it
  // under the title just prints the same sentence twice.
  const summary = usefulSummary(item.title, item.content);

  // Classify and tag from the lede only. Full bodies — GitHub release notes
  // especially — mention enough incidental terms to trip most rules, which
  // produced tags like "voice" and "enterprise" on a routine version bump.
  const snippet = summary?.slice(0, SNIPPET_LIMIT) ?? null;

  const category = classify(item.title, snippet, {
    isRelease: meta.isRelease === true,
    isPaper: meta.isPaper === true,
    isModelRelease: meta.isModelRelease === true,
  });

  // Text mentions, plus the feed's own org when it only covers one company.
  const orgSlugs = matchOrgs(`${item.title}\n${snippet ?? ""}`, item.url);
  if (sourceOrgSlug && !orgSlugs.includes(sourceOrgSlug)) {
    orgSlugs.push(sourceOrgSlug);
  }

  const tags = extractTags(
    item.title,
    snippet,
    Array.isArray(meta.keywords) ? (meta.keywords as string[]) : undefined,
  );

  const { score, reasons, isRumour } = scoreCredibility({
    title: item.title,
    summary: snippet,
    url: item.url,
    baseCredibility,
    publisherDomain: item.publisherDomain,
    author: item.author,
    hasPublishDate: true,
    corroborationCount,
  });

  return {
    canonicalUrl: canonicalizeUrl(item.url),
    publisherDomain: item.publisherDomain ?? null,
    category,
    orgSlugs,
    tags,
    credibility: score,
    credibilityReason: reasons,
    isRumour,
    impact: scoreImpact({
      category,
      credibility: score,
      orgSlugs,
      corroborationCount,
      meta,
      isCaseStudy: isCaseStudy(item.title, snippet),
    }),
    summary,
  };
}

/**
 * Drop a summary that only restates the headline.
 *
 * Google News and several press feeds set the description to the title
 * verbatim (sometimes with the publisher appended), which renders as the same
 * sentence printed twice in the row.
 */
export function usefulSummary(
  title: string,
  content?: string | null,
): string | null {
  const summary = content?.trim();
  if (!summary) return null;

  const normalize = (s: string) =>
    s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

  const normTitle = normalize(title);
  const normSummary = normalize(summary);

  if (normSummary === normTitle) return null;
  // Also catches "<title> <Publisher Name>" descriptions.
  if (normSummary.startsWith(normTitle) && normSummary.length - normTitle.length < 40) {
    return null;
  }

  return summary;
}

/** How much a category matters in this feed, 0–30. */
const CATEGORY_WEIGHT: Record<ArticleCategory, number> = {
  "model-launch": 30,
  "model-leak": 24,
  "tool-launch": 20,
  "feature-launch": 18,
  deal: 18,
  "infra-compute": 16,
  "research-paper": 15,
  benchmark: 14,
  policy: 10,
  people: 10,
  other: 4,
};

/**
 * A 0–100 prominence score powering the "impact" sort.
 *
 * Deliberately separate from credibility: a well-sourced routine version bump
 * is highly credible and low impact, while a plausible frontier-model leak is
 * the reverse. Sorting by one should never silently sort by the other.
 */
export function scoreImpact(input: {
  category: ArticleCategory;
  credibility: number;
  orgSlugs: string[];
  corroborationCount: number;
  meta: Record<string, unknown>;
  isCaseStudy?: boolean;
}): number {
  let score = CATEGORY_WEIGHT[input.category];

  // A tracked frontier lab being involved is most of what makes news relevant.
  const primaryHits = input.orgSlugs.filter((s) => PRIMARY_SLUGS.has(s)).length;
  score += Math.min(primaryHits, 3) * 8;

  // Credibility contributes, but can't by itself make a dull item prominent.
  score += input.credibility * 4;

  score += Math.min(input.corroborationCount, 5) * 3;

  // Community attention, where the fetcher measured it.
  const points = Number(input.meta.points ?? 0);
  if (points > 0) score += Math.min(Math.log10(points + 1) * 8, 16);

  const upvotes = Number(input.meta.upvotes ?? 0);
  if (upvotes > 0) score += Math.min(Math.log10(upvotes + 1) * 10, 20);

  // Customer stories are first-party and therefore highly credible, which
  // would otherwise float vendor marketing to the top of an impact sort.
  if (input.isCaseStudy) score -= 25;

  return Math.max(0, Math.min(100, Math.round(score)));
}
