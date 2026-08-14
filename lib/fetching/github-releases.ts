import Parser from "rss-parser";
import { RAW_CONTENT_LIMIT, asText, politeFetch, stripHtml } from "./http";
import type { FeedItem, FetchResult } from "./types";

const parser = new Parser();

/**
 * GitHub `releases.atom` feeds — how harness and inference-engine launches
 * (Claude Code, Codex, vLLM, llama.cpp, Transformers) are tracked.
 *
 * Entry titles are often just a bare version ("v1.2.3") or empty, which reads
 * as noise in a news feed, so the repo name is prefixed. The tag is kept in
 * meta for the release tracker in Section 6.
 */
export async function fetchGithubReleases(
  feedUrl: string,
  opts: { etag?: string | null; lastModified?: string | null } = {},
): Promise<FetchResult> {
  const res = await politeFetch(feedUrl, opts);
  if (res.status === 304) {
    return { items: [], notModified: true, etag: opts.etag ?? undefined };
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${feedUrl}`);

  const feed = await parser.parseString(await res.text());
  const repo = repoFromFeedUrl(feedUrl);
  const items: FeedItem[] = [];

  for (const entry of feed.items ?? []) {
    const url = asText(entry.link);
    if (!url) continue;

    const isoDate = asText(entry.isoDate);
    const publishedAt = isoDate ? new Date(isoDate) : new Date();
    if (Number.isNaN(publishedAt.getTime())) continue;

    const rawTitle = asText(entry.title) ?? "";
    const tag = tagFromReleaseUrl(url) ?? rawTitle;
    // "vllm-project/vllm v0.11.0" reads better than a bare "v0.11.0".
    const title = repo
      ? `${repo} ${rawTitle || tag}`.trim()
      : rawTitle || tag || url;

    items.push({
      url,
      title,
      publishedAt,
      content: asText(entry.content)
        ? stripHtml(asText(entry.content)!).slice(0, RAW_CONTENT_LIMIT)
        : undefined,
      author: asText(entry.author),
      meta: { repo, tag, isRelease: true },
    });
  }

  return {
    items,
    etag: res.headers.get("etag") ?? undefined,
    lastModified: res.headers.get("last-modified") ?? undefined,
  };
}

/** "https://github.com/owner/repo/releases.atom" → "owner/repo" */
export function repoFromFeedUrl(feedUrl: string): string | null {
  const m = feedUrl.match(/github\.com\/([^/]+\/[^/]+)\/releases\.atom/);
  return m ? m[1] : null;
}

/** ".../releases/tag/v1.2.3" → "v1.2.3" */
export function tagFromReleaseUrl(url: string): string | null {
  const m = url.match(/\/releases\/tag\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}
