import Parser from "rss-parser";
import { RAW_CONTENT_LIMIT, asText, politeFetch, stripHtml } from "./http";
import type { FeedItem, FetchResult } from "./types";

const parser = new Parser();

/**
 * Subreddit Atom feeds.
 *
 * Reddit rate-limits hard — a second concurrent request earns a 429 — so this
 * relies on politeFetch's per-host throttle and backoff. Posts link to the
 * comment thread rather than the outbound URL, because the thread is where the
 * corroboration or debunking happens.
 */
export async function fetchReddit(
  feedUrl: string,
  opts: { etag?: string | null; lastModified?: string | null } = {},
): Promise<FetchResult> {
  const res = await politeFetch(feedUrl, opts);
  if (res.status === 304) {
    return { items: [], notModified: true, etag: opts.etag ?? undefined };
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${feedUrl}`);

  const feed = await parser.parseString(await res.text());
  const items: FeedItem[] = [];

  for (const entry of feed.items ?? []) {
    const url = asText(entry.link);
    const title = asText(entry.title);
    if (!url || !title) continue;

    const isoDate = asText(entry.isoDate);
    const publishedAt = isoDate ? new Date(isoDate) : new Date();
    if (Number.isNaN(publishedAt.getTime())) continue;

    const body = cleanRedditBody(
      stripHtml(asText(entry.content) ?? asText(entry.contentSnippet) ?? ""),
    );

    items.push({
      url,
      title: stripHtml(title),
      publishedAt,
      content: body.slice(0, RAW_CONTENT_LIMIT) || undefined,
      author: asText(entry.author) ?? asText(entry.creator),
      meta: { subreddit: subredditFrom(feedUrl) },
    });
  }

  return {
    items,
    etag: res.headers.get("etag") ?? undefined,
    lastModified: res.headers.get("last-modified") ?? undefined,
  };
}

/**
 * Reddit wraps every post body in navigation chrome — "submitted by /u/name
 * [link] [comments]" — which is all the body there is for a link post. Left in,
 * it fills the summary line with text that says nothing about the story.
 */
export function cleanRedditBody(text: string): string {
  return text
    .replace(/submitted by\s*\/u\/[\w-]+/gi, "")
    .replace(/\[(link|comments)\]/gi, "")
    .replace(/^\s*https?:\/\/\S+\s*$/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** ".../r/LocalLLaMA/.rss" → "LocalLLaMA" */
export function subredditFrom(feedUrl: string): string | null {
  const m = feedUrl.match(/\/r\/([^/]+)/);
  return m ? m[1] : null;
}
