/** A single item from any feed, before enrichment. */
export interface FeedItem {
  url: string;
  title: string;
  publishedAt: Date;
  /** Plain text, already stripped of HTML and truncated. */
  content?: string;
  author?: string;
  /**
   * Real publisher host when the source is an aggregator that links out
   * (Google News). Absent means the source's own host is the publisher.
   */
  publisherDomain?: string;
  /** Fetcher-specific extras: HN points, HF paper upvotes, release tag. */
  meta?: Record<string, unknown>;
}

/** What a fetch returned, plus the cache validators to store for next time. */
export interface FetchResult {
  items: FeedItem[];
  etag?: string;
  lastModified?: string;
  /** True when the server answered 304 and there is nothing new to parse. */
  notModified?: boolean;
}
