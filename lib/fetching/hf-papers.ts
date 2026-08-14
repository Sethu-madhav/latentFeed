import { RAW_CONTENT_LIMIT, politeFetch } from "./http";
import type { FeedItem, FetchResult } from "./types";

interface HfDailyPaper {
  paper?: {
    id?: string;
    title?: string;
    summary?: string;
    ai_summary?: string;
    ai_keywords?: string[];
    upvotes?: number;
    publishedAt?: string;
    submittedOnDailyAt?: string;
    authors?: { name?: string }[];
    githubRepo?: string;
  };
  publishedAt?: string;
  title?: string;
}

/**
 * Hugging Face Daily Papers — the community-curated shortlist of what actually
 * mattered, which is a far better signal than raw arXiv volume.
 *
 * The JSON carries two things the RSS feeds can't give us: `upvotes` (a real
 * popularity signal, mapped to impact) and `ai_keywords` (usable tags with no
 * LLM call of our own).
 */
export async function fetchHfPapers(feedUrl: string): Promise<FetchResult> {
  const url = feedUrl.includes("?") ? feedUrl : `${feedUrl}?limit=50`;
  const res = await politeFetch(url, { accept: "application/json" });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);

  const payload = (await res.json()) as HfDailyPaper[];
  if (!Array.isArray(payload)) return { items: [] };

  const items: FeedItem[] = [];

  for (const entry of payload) {
    const paper = entry.paper;
    const id = paper?.id;
    const title = (paper?.title ?? entry.title)?.trim();
    if (!id || !title) continue;

    const dateStr =
      paper?.submittedOnDailyAt ?? entry.publishedAt ?? paper?.publishedAt;
    const publishedAt = dateStr ? new Date(dateStr) : new Date();
    if (Number.isNaN(publishedAt.getTime())) continue;

    const summary = (paper?.ai_summary ?? paper?.summary ?? "")
      .replace(/\s+/g, " ")
      .trim();

    items.push({
      // Link to the HF paper page: it has the discussion and the arXiv link.
      url: `https://huggingface.co/papers/${id}`,
      title: title.replace(/\s+/g, " "),
      publishedAt,
      content: summary.slice(0, RAW_CONTENT_LIMIT) || undefined,
      author: paper?.authors
        ?.map((a) => a.name)
        .filter(Boolean)
        .slice(0, 3)
        .join(", "),
      meta: {
        arxivId: id,
        upvotes: paper?.upvotes ?? 0,
        keywords: paper?.ai_keywords ?? [],
        githubRepo: paper?.githubRepo,
        isPaper: true,
      },
    });
  }

  return { items };
}
