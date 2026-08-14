import type { CredibilityReason } from "@/db/schema";
import { firstPartyOrg, hostOf } from "@/lib/orgs";
import { hasRumourLanguage } from "./classify";

/**
 * Credibility tiers for publishers we meet through aggregators.
 *
 * Google News items arrive with a `news.google.com` link, so the source's own
 * base score says nothing about the reporting. The real publisher domain is
 * graded here instead — otherwise a WSJ scoop and a content farm would land on
 * the same number.
 */
export const PUBLISHER_TIERS: Record<string, 1 | 2 | 3 | 4 | 5> = {
  // Wire services and papers of record
  "reuters.com": 5,
  "apnews.com": 5,
  "bloomberg.com": 5,
  "wsj.com": 5,
  "ft.com": 5,
  "nytimes.com": 5,
  "washingtonpost.com": 5,
  "economist.com": 5,
  "cnbc.com": 4,

  // Tech desks with real reporting
  "theinformation.com": 5,
  "arstechnica.com": 4,
  "theverge.com": 4,
  "techcrunch.com": 4,
  "wired.com": 4,
  "technologyreview.com": 4,
  "semianalysis.com": 4,
  "theregister.com": 4,
  "axios.com": 4,
  "semafor.com": 4,
  "businessinsider.com": 3,
  "forbes.com": 3,
  "venturebeat.com": 3,
  "zdnet.com": 3,
  "engadget.com": 3,
  "cnet.com": 3,
  "9to5google.com": 3,
  "9to5mac.com": 3,
  "androidauthority.com": 3,
  "techradar.com": 2,
  "tomshardware.com": 3,
  "theguardian.com": 4,
  "bbc.com": 4,
  "scmp.com": 3,
  "nikkei.com": 4,

  // Aggregators and community
  "techmeme.com": 3,
  "news.ycombinator.com": 2,
  "reddit.com": 2,
  "medium.com": 2,
  "substack.com": 3,

  // Leak trackers: often right, never confirmed
  "testingcatalog.com": 1,
  "windowsreport.com": 2,
  "wccftech.com": 2,
};

export interface CredibilityInput {
  title: string;
  summary?: string | null;
  url: string;
  /** The source's configured starting score. */
  baseCredibility: number;
  /** Real publisher host when the source links out (Google News). */
  publisherDomain?: string | null;
  author?: string | null;
  /** Whether the feed gave a real publish date rather than a fallback. */
  hasPublishDate: boolean;
  /** Independent outlets already seen carrying this story. */
  corroborationCount?: number;
}

export interface CredibilityResult {
  score: number;
  reasons: CredibilityReason[];
  isRumour: boolean;
}

/**
 * Score an article 1–5 and record why.
 *
 * Every rule that fires is kept in `reasons` so the UI can explain the number
 * on hover — an opaque score nobody can interrogate is worse than none.
 */
export function scoreCredibility(input: CredibilityInput): CredibilityResult {
  const reasons: CredibilityReason[] = [];

  // --- base -------------------------------------------------------------
  let score: number;
  const publisher = input.publisherDomain ?? hostOf(input.url);

  if (input.publisherDomain) {
    const tier = tierForDomain(input.publisherDomain);
    if (tier !== null) {
      score = tier;
      reasons.push({
        rule: "publisher",
        delta: 0,
        detail: `${input.publisherDomain} rated ${tier}/5`,
      });
    } else {
      // Unknown publisher behind an aggregator: mid-low, not the feed's score.
      score = 3;
      reasons.push({
        rule: "publisher-unknown",
        delta: 0,
        detail: `${input.publisherDomain} not rated — defaulted to 3/5`,
      });
    }
  } else {
    score = input.baseCredibility;
    reasons.push({
      rule: "source",
      delta: 0,
      detail: `source rated ${input.baseCredibility}/5`,
    });
  }

  // --- first-party -------------------------------------------------------
  // A lab announcing on its own domain is as confirmed as news gets.
  const owner = firstPartyOrg(input.url);
  if (owner && score < 5) {
    score += 1;
    reasons.push({
      rule: "first-party",
      delta: 1,
      detail: `published on ${owner}'s own domain`,
    });
  }

  // --- hedging language --------------------------------------------------
  const hedge = hasRumourLanguage(`${input.title}\n${input.summary ?? ""}`);
  if (hedge) {
    score -= 1;
    reasons.push({
      rule: "hedged",
      delta: -1,
      detail: `unconfirmed phrasing (“${hedge}”)`,
    });
  }

  // --- corroboration -----------------------------------------------------
  // Independent outlets carrying the same story is the strongest signal we
  // have short of a first-party confirmation.
  const corroboration = input.corroborationCount ?? 0;
  if (corroboration >= 2) {
    score += 1;
    reasons.push({
      rule: "corroborated",
      delta: 1,
      detail: `${corroboration} independent sources carrying this`,
    });
  }

  // --- provenance --------------------------------------------------------
  if (!input.author && !input.hasPublishDate) {
    score -= 1;
    reasons.push({
      rule: "no-provenance",
      delta: -1,
      detail: "no byline and no publish date",
    });
  }

  const clamped = Math.max(1, Math.min(5, score));
  if (clamped !== score) {
    reasons.push({
      rule: "clamped",
      delta: clamped - score,
      detail: `clamped to ${clamped}/5`,
    });
  }

  return {
    score: clamped,
    reasons,
    // At 2 and below the item is presented as unverified.
    isRumour: clamped <= 2,
  };
}

/** Look up a domain's tier, matching subdomains against the registered host. */
export function tierForDomain(domain: string): number | null {
  const host = domain.replace(/^www\./, "").toLowerCase();
  if (host in PUBLISHER_TIERS) return PUBLISHER_TIERS[host];
  for (const [known, tier] of Object.entries(PUBLISHER_TIERS)) {
    if (host.endsWith(`.${known}`)) return tier;
  }
  return null;
}
