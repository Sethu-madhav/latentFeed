import Parser from "rss-parser";
import { RAW_CONTENT_LIMIT, asText, politeFetch, stripHtml } from "./http";
import type { FeedItem, FetchResult } from "./types";

const parser = new Parser({ customFields: { item: ["source"] } });

/**
 * Google News search feeds. These are how Anthropic, xAI, SSI and Thinking
 * Machines get covered at all — none of them publish a working RSS feed.
 *
 * Two things make this different from a plain RSS source:
 *
 *  1. Item links point at a news.google.com redirect, so the host tells us
 *     nothing. The real publisher lives in `<source url="https://www.wsj.com">`,
 *     and that domain is what the credibility scorer must grade — otherwise a
 *     WSJ scoop and a content farm score identically.
 *  2. Titles are suffixed with " - Publisher Name", noise for display and dedup.
 */
export async function fetchGoogleNews(feedUrl: string): Promise<FetchResult> {
  const res = await politeFetch(feedUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${feedUrl}`);

  const xml = await res.text();
  const publisherByLink = publisherUrlsByLink(xml);

  const feed = await parser.parseString(xml);
  const items: FeedItem[] = [];

  for (const item of feed.items ?? []) {
    const url = asText(item.link);
    const rawTitle = asText(item.title);
    if (!url || !rawTitle) continue;

    const isoDate = asText(item.isoDate);
    const pubDate = asText(item.pubDate);
    const publishedAt = isoDate
      ? new Date(isoDate)
      : pubDate
        ? new Date(pubDate)
        : new Date();
    if (Number.isNaN(publishedAt.getTime())) continue;

    const publisherName = asText(item.source);
    const publisherDomain = domainOf(publisherByLink.get(url));
    const snippet = asText(item.contentSnippet);

    items.push({
      url,
      title: stripPublisherSuffix(stripHtml(rawTitle), publisherName),
      publishedAt,
      content: snippet
        ? stripHtml(snippet).slice(0, RAW_CONTENT_LIMIT)
        : undefined,
      publisherDomain: publisherDomain ?? undefined,
      meta: { viaGoogleNews: true, publisherName },
    });
  }

  return { items };
}

/**
 * Map each item's link to its publisher URL by reading the raw XML.
 *
 * rss-parser flattens `<source url="https://www.wsj.com">WSJ</source>` down to
 * the string "WSJ" and drops the attribute, and its xml2js settings can't be
 * overridden without breaking the parse — so the attribute is recovered here.
 */
export function publisherUrlsByLink(xml: string): Map<string, string> {
  const map = new Map<string, string>();

  for (const block of xml.match(/<item>[\s\S]*?<\/item>/g) ?? []) {
    const link = block
      .match(/<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/)?.[1]
      ?.trim();
    const sourceUrl = block.match(/<source[^>]*\burl="([^"]+)"/)?.[1];
    if (link && sourceUrl) map.set(link, sourceUrl);
  }

  return map;
}

function domainOf(url?: string): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

/** Google News appends " - Publisher"; drop it so titles dedupe cleanly. */
export function stripPublisherSuffix(
  title: string,
  publisherName?: string,
): string {
  if (publisherName && title.endsWith(` - ${publisherName}`)) {
    return title.slice(0, -(publisherName.length + 3)).trim();
  }
  // Fall back to trimming a trailing " - Something" with no inner hyphen.
  return title.replace(/\s+-\s+[^-]{2,40}$/, "").trim() || title;
}
