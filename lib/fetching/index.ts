import type { Source } from "@/db/schema";
import { fetchArxiv } from "./arxiv";
import { fetchGithubReleases } from "./github-releases";
import { fetchGoogleNews } from "./google-news";
import { fetchHackerNews } from "./hn";
import { fetchHfModels } from "./hf-models";
import { fetchHfPapers } from "./hf-papers";
import { fetchReddit } from "./reddit";
import { fetchRss } from "./rss";
import type { FetchResult } from "./types";

export * from "./types";
export { RAW_CONTENT_LIMIT, politeFetch, stripHtml } from "./http";

/** Route a source to the fetcher for its kind. */
export async function fetchSource(source: Source): Promise<FetchResult> {
  const feedUrl = source.feedUrl;
  if (!feedUrl) {
    throw new Error(`source ${source.slug} has no feed_url`);
  }

  const conditional = { etag: source.etag, lastModified: source.lastModified };

  switch (source.kind) {
    case "rss":
      return fetchRss(feedUrl, conditional);
    case "github_releases":
      return fetchGithubReleases(feedUrl, conditional);
    case "google_news":
      // No conditional GET: the query feed's ETag changes on every request.
      return fetchGoogleNews(feedUrl);
    case "arxiv":
      return fetchArxiv(feedUrl);
    case "hf_papers":
      return fetchHfPapers(feedUrl);
    case "hf_models":
      return fetchHfModels(feedUrl, source.meta ?? undefined);
    case "hn":
      return fetchHackerNews(feedUrl, source.meta ?? undefined);
    case "reddit":
      return fetchReddit(feedUrl, conditional);
    default: {
      const exhaustive: never = source.kind;
      throw new Error(`unknown source kind: ${String(exhaustive)}`);
    }
  }
}
