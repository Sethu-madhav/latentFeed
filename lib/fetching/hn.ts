import { RAW_CONTENT_LIMIT, politeFetch, stripHtml } from "./http";
import type { FeedItem, FetchResult } from "./types";

interface AlgoliaHit {
  objectID: string;
  title?: string;
  url?: string | null;
  story_text?: string | null;
  points?: number;
  num_comments?: number;
  created_at?: string;
  author?: string;
}

/**
 * Hacker News via the Algolia API.
 *
 * HN carries everything, so the source's `meta.queries` narrows it to AI
 * stories. Each query is a separate request; results are merged and deduped by
 * story id, since one story matches several queries.
 */
export async function fetchHackerNews(
  feedUrl: string,
  meta?: Record<string, unknown>,
): Promise<FetchResult> {
  const queries = Array.isArray(meta?.queries)
    ? (meta.queries as string[])
    : [""];

  const byId = new Map<string, FeedItem>();

  for (const query of queries) {
    const url = query
      ? `${feedUrl}&query=${encodeURIComponent(query)}`
      : feedUrl;

    const res = await politeFetch(url, { accept: "application/json" });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);

    const payload = (await res.json()) as { hits?: AlgoliaHit[] };

    for (const hit of payload.hits ?? []) {
      const title = hit.title?.trim();
      if (!title || byId.has(hit.objectID)) continue;

      const publishedAt = hit.created_at
        ? new Date(hit.created_at)
        : new Date();
      if (Number.isNaN(publishedAt.getTime())) continue;

      const discussionUrl = `https://news.ycombinator.com/item?id=${hit.objectID}`;

      byId.set(hit.objectID, {
        // Prefer the linked article; Ask/Show HN posts have no outbound URL.
        url: hit.url || discussionUrl,
        title,
        publishedAt,
        content: hit.story_text
          ? stripHtml(hit.story_text).slice(0, RAW_CONTENT_LIMIT)
          : undefined,
        author: hit.author,
        meta: {
          hnId: hit.objectID,
          points: hit.points ?? 0,
          comments: hit.num_comments ?? 0,
          discussionUrl,
          matchedQuery: query,
        },
      });
    }
  }

  return { items: [...byId.values()] };
}
