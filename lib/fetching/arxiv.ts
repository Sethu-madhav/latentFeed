import Parser from "rss-parser";
import { RAW_CONTENT_LIMIT, asText, politeFetch, stripHtml } from "./http";
import type { FeedItem, FetchResult } from "./types";

const parser = new Parser({
  customFields: { item: ["announce_type", "dc:creator"] },
});

/**
 * arXiv category feeds (cs.CL, cs.LG, cs.AI).
 *
 * Two arXiv-specific details:
 *  - Descriptions start with "arXiv:2501.12345v1 Announce Type: new Abstract:"
 *    boilerplate that has to come off before the text is usable as a summary.
 *  - Feeds carry both new papers and cross-lists/replacements. Replacements are
 *    dropped: a v2 of a paper from March is not news today.
 */
export async function fetchArxiv(feedUrl: string): Promise<FetchResult> {
  const res = await politeFetch(feedUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${feedUrl}`);

  const feed = await parser.parseString(await res.text());
  const items: FeedItem[] = [];

  for (const entry of feed.items ?? []) {
    const url = asText(entry.link);
    const title = asText(entry.title);
    if (!url || !title) continue;

    const raw =
      asText(entry.contentSnippet) ??
      asText(entry.content) ??
      asText(entry.summary) ??
      "";
    const announceType =
      asText((entry as { announce_type?: unknown }).announce_type) ??
      announceTypeFrom(raw);

    // Keep new and cross-listed work; skip revisions of older papers.
    if (announceType && /replace/i.test(announceType)) continue;

    const isoDate = asText(entry.isoDate);
    const publishedAt = isoDate ? new Date(isoDate) : new Date();
    if (Number.isNaN(publishedAt.getTime())) continue;

    items.push({
      url,
      title: stripHtml(title).replace(/\s+/g, " "),
      publishedAt,
      content: cleanAbstract(raw).slice(0, RAW_CONTENT_LIMIT) || undefined,
      author:
        asText((entry as { "dc:creator"?: unknown })["dc:creator"]) ??
        asText(entry.creator),
      // Assert the category: abstracts that discuss "model leakage" or a
      // "leaked" dataset otherwise trip the leak rules and land a peer
      // submission in the rumour quarantine.
      meta: { arxivId: arxivIdFrom(url), announceType, isPaper: true },
    });
  }

  return { items };
}

function announceTypeFrom(text: string): string | undefined {
  const m = text.match(/Announce Type:\s*([\w-]+)/i);
  return m ? m[1] : undefined;
}

/** Drop the "arXiv:… Announce Type: … Abstract:" preamble. */
export function cleanAbstract(text: string): string {
  return stripHtml(text)
    .replace(/^arXiv:\S+\s*/i, "")
    .replace(/Announce Type:\s*[\w-]+\s*/i, "")
    .replace(/^Abstract:\s*/i, "")
    .trim();
}

/** "https://arxiv.org/abs/2501.12345" → "2501.12345" */
export function arxivIdFrom(url: string): string | null {
  const m = url.match(/arxiv\.org\/abs\/([\d.]+(?:v\d+)?)/i);
  return m ? m[1] : null;
}
