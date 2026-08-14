/**
 * Duplicate detection without embeddings.
 *
 * Section 3 adds semantic dedup via pgvector; until then two cheap signals do
 * most of the work: a canonical URL (the same article shared with different
 * tracking params is the same article) and normalized-title similarity (the
 * same story filed by eight outlets shares most of its title tokens).
 */

/** Query params that identify a campaign, not a document. */
const TRACKING_PARAMS = [
  /^utm_/i,
  /^ref$/i,
  /^ref_src$/i,
  /^source$/i,
  /^fbclid$/i,
  /^gclid$/i,
  /^mc_cid$/i,
  /^mc_eid$/i,
  /^igshid$/i,
  /^s$/i,
  /^at_medium$/i,
  /^at_campaign$/i,
  /^__twitter_impression$/i,
  /^guccounter$/i,
];

/**
 * Strip tracking noise so the same article always yields the same key.
 * Also unwraps AMP paths and drops a trailing slash and fragment.
 */
export function canonicalizeUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return raw.trim();
  }

  url.hash = "";
  url.protocol = "https:";
  url.hostname = url.hostname.replace(/^www\./, "").toLowerCase();

  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMS.some((p) => p.test(key))) url.searchParams.delete(key);
  }
  // Keep query order stable so param shuffling doesn't create a second row.
  url.searchParams.sort();

  url.pathname = url.pathname
    .replace(/\/amp\/?$/i, "/")
    .replace(/\.amp$/i, "")
    .replace(/\/+$/, "");
  if (url.pathname === "") url.pathname = "/";

  return url.toString().replace(/\?$/, "");
}

/** Words too common in headlines to carry any matching signal. */
const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "for", "with",
  "at", "by", "from", "as", "is", "are", "was", "were", "be", "been", "it",
  "its", "this", "that", "these", "those", "new", "now", "says", "say", "will",
  "has", "have", "how", "what", "why", "you", "your", "we", "our", "can",
]);

/** Lowercase, strip punctuation, drop stopwords → the tokens we compare. */
export function titleTokens(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, " ")
      .split(/\s+/)
      .map((t) => t.replace(/^-+|-+$/g, ""))
      .filter((t) => t.length > 2 && !STOPWORDS.has(t)),
  );
}

/**
 * Jaccard overlap of two titles' significant tokens, 0–1.
 * Above ~0.6 the two headlines are almost always the same story.
 */
export function titleSimilarity(a: string, b: string): number {
  const ta = titleTokens(a);
  const tb = titleTokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;

  let shared = 0;
  for (const token of ta) if (tb.has(token)) shared++;

  return shared / (ta.size + tb.size - shared);
}

/** Titles at or above this overlap are treated as the same story. */
export const DUPLICATE_THRESHOLD = 0.6;

/** Pick the closest existing title, if any clears the threshold. */
export function findDuplicate<T extends { title: string }>(
  title: string,
  candidates: T[],
  threshold = DUPLICATE_THRESHOLD,
): { match: T; similarity: number } | null {
  let best: { match: T; similarity: number } | null = null;

  for (const candidate of candidates) {
    const similarity = titleSimilarity(title, candidate.title);
    if (similarity >= threshold && (!best || similarity > best.similarity)) {
      best = { match: candidate, similarity };
    }
  }
  return best;
}
