import Parser from "rss-parser";
import { RAW_CONTENT_LIMIT, asText, politeFetch, stripHtml } from "./http";
import type { FeedItem, FetchResult } from "./types";

type CustomItem = {
  "content:encoded"?: string;
  content?: string;
  contentSnippet?: string;
  summary?: string;
  /** Google News puts the real publisher here: <source url="...">Name</source> */
  source?: { $?: { url?: string }; _?: string } | string;
};

const parser: Parser<Record<string, unknown>, CustomItem> = new Parser({
  customFields: { item: ["content:encoded", "summary", "source"] },
});

/**
 * Fetch and parse an RSS/Atom feed. Handles conditional GET: a 304 returns
 * `notModified` with no items, so unchanged feeds cost one cheap request.
 */
export async function fetchRss(
  feedUrl: string,
  opts: { etag?: string | null; lastModified?: string | null } = {},
): Promise<FetchResult> {
  const res = await politeFetch(feedUrl, opts);

  if (res.status === 304) {
    return { items: [], notModified: true, etag: opts.etag ?? undefined };
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${feedUrl}`);
  }

  const xml = await res.text();
  const feed = await parser.parseString(xml);

  return {
    items: (feed.items ?? []).flatMap((item) => normalizeItem(item) ?? []),
    etag: res.headers.get("etag") ?? undefined,
    lastModified: res.headers.get("last-modified") ?? undefined,
  };
}

/** Turn one parsed RSS entry into a FeedItem, or drop it if unusable. */
export function normalizeItem(
  item: Parser.Item & CustomItem,
): FeedItem | null {
  const url = asText(item.link);
  const title = asText(item.title);
  if (!url || !title) return null;

  const isoDate = asText(item.isoDate);
  const pubDate = asText(item.pubDate);
  const publishedAt = isoDate
    ? new Date(isoDate)
    : pubDate
      ? new Date(pubDate)
      : new Date();
  if (Number.isNaN(publishedAt.getTime())) return null;

  const raw =
    asText(item["content:encoded"]) ??
    asText(item.content) ??
    asText(item.summary) ??
    asText(item.contentSnippet) ??
    "";
  const content = stripHtml(raw).slice(0, RAW_CONTENT_LIMIT);

  return {
    url,
    title: stripHtml(title),
    publishedAt,
    content: content || undefined,
    author: asText(item.creator),
  };
}
