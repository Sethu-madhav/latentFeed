import type { SourceKind } from "@/db/schema";
import { fetchArxiv } from "@/lib/fetching/arxiv";
import { fetchGithubReleases } from "@/lib/fetching/github-releases";
import { fetchGoogleNews } from "@/lib/fetching/google-news";
import { fetchHackerNews } from "@/lib/fetching/hn";
import { fetchHfModels } from "@/lib/fetching/hf-models";
import { fetchHfPapers } from "@/lib/fetching/hf-papers";
import { fetchReddit } from "@/lib/fetching/reddit";
import { fetchRss } from "@/lib/fetching/rss";

/**
 * Guess the fetcher from the URL so users don't have to know the taxonomy.
 * Order matters: the GitHub releases path must be checked before the generic
 * github.com case.
 */
export function detectKind(feedUrl: string): SourceKind {
  const url = feedUrl.toLowerCase();

  if (url.includes("news.google.com/rss")) return "google_news";
  if (url.includes("/releases.atom")) return "github_releases";
  if (url.includes("arxiv.org/rss") || url.includes("export.arxiv.org")) {
    return "arxiv";
  }
  if (url.includes("huggingface.co/api/daily_papers")) return "hf_papers";
  if (url.includes("huggingface.co/api/models")) return "hf_models";
  if (url.includes("hn.algolia.com")) return "hn";
  if (/reddit\.com\/r\//.test(url)) return "reddit";
  return "rss";
}

export interface ProbeResult {
  ok: boolean;
  kind: SourceKind;
  itemCount: number;
  sampleTitle?: string;
  newestAt?: Date;
  error?: string;
}

/**
 * Fetch a candidate feed through the real fetcher before it is saved.
 *
 * Adding a URL that silently returns nothing is the most likely way to break
 * this app quietly — the source sits in the list looking healthy while
 * contributing zero articles — so a feed has to prove it parses first.
 */
export async function probeFeed(
  feedUrl: string,
  kindOverride?: SourceKind,
): Promise<ProbeResult> {
  const kind = kindOverride ?? detectKind(feedUrl);

  try {
    const result = await fetchByKind(feedUrl, kind);
    const items = result.items;

    if (items.length === 0) {
      return {
        ok: false,
        kind,
        itemCount: 0,
        error:
          "Fetched successfully but produced no items — check the URL points at a feed, not a web page.",
      };
    }

    const newest = items.reduce(
      (max, i) => (i.publishedAt > max ? i.publishedAt : max),
      items[0].publishedAt,
    );

    return {
      ok: true,
      kind,
      itemCount: items.length,
      sampleTitle: items[0].title,
      newestAt: newest,
    };
  } catch (err) {
    return {
      ok: false,
      kind,
      itemCount: 0,
      error: humanizeProbeError(err),
    };
  }
}

/**
 * Turn fetch and parser failures into something a person can act on.
 *
 * The raw errors are useless in a form — xml2js reports "Unexpected close tag
 * Line: 0 Column: 332", which tells the user nothing about the fact that they
 * pasted a homepage URL instead of a feed URL.
 */
export function humanizeProbeError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);

  if (/Unexpected close tag|Non-whitespace before first tag|Invalid character|Unexpected end/i.test(message)) {
    return "That URL returned a web page, not a feed. Look for an RSS or Atom link on the site (often /feed, /rss, or /index.xml).";
  }
  if (/Unexpected token|is not valid JSON/i.test(message)) {
    return "That URL returned something that isn't valid JSON or XML.";
  }
  if (/HTTP 40[13]/.test(message)) {
    return `${message} — the publisher is refusing automated requests. Some feeds block non-browser agents.`;
  }
  if (/HTTP 404/.test(message)) {
    return `${message} — the feed has probably moved. Check the site for its current feed URL.`;
  }
  if (/HTTP 429/.test(message)) {
    return `${message} — rate limited. Wait a minute and try again.`;
  }
  if (/aborted|timeout|ETIMEDOUT/i.test(message)) {
    return "The request timed out. The feed may be slow or unreachable.";
  }
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(message)) {
    return "That host could not be resolved — check the URL for typos.";
  }
  return message;
}

function fetchByKind(feedUrl: string, kind: SourceKind) {
  switch (kind) {
    case "rss":
      return fetchRss(feedUrl);
    case "github_releases":
      return fetchGithubReleases(feedUrl);
    case "google_news":
      return fetchGoogleNews(feedUrl);
    case "arxiv":
      return fetchArxiv(feedUrl);
    case "hf_papers":
      return fetchHfPapers(feedUrl);
    case "hf_models":
      return fetchHfModels(feedUrl);
    case "hn":
      return fetchHackerNews(feedUrl);
    case "reddit":
      return fetchReddit(feedUrl);
    default: {
      const exhaustive: never = kind;
      throw new Error(`unknown source kind: ${String(exhaustive)}`);
    }
  }
}

/** URL-safe slug from a display name. */
export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "source"
  );
}

/** Append -2, -3 … until the slug doesn't collide with an existing one. */
export function uniqueSlug(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; n < 500; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}
