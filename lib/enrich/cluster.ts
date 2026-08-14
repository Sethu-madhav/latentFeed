import { cosineSimilarity } from "@/lib/embeddings";
import { titleSimilarity } from "./dedup";

/**
 * Grouping the same event across outlets.
 *
 * Deliberately looser than dedup. Dedup asks "is this literally the same
 * item?" and answers conservatively, because a false positive silently drops
 * an article. Clustering asks "are these about the same event?", where a false
 * positive just puts two related headlines on one page.
 */

/** Title-overlap floor for two articles to be the same story. */
export const CLUSTER_TITLE_THRESHOLD = 0.42;

/** Cosine similarity floor when embeddings are available. */
export const CLUSTER_EMBEDDING_THRESHOLD = 0.82;

export interface Clusterable {
  id: string;
  title: string;
  sourceId: number;
  publishedAt: Date;
  embedding?: number[] | null;
}

/** How close two items are, using vectors when both have them. */
export function clusterSimilarity(a: Clusterable, b: Clusterable): number {
  if (a.embedding && b.embedding) {
    return cosineSimilarity(a.embedding, b.embedding);
  }
  return titleSimilarity(a.title, b.title);
}

/** Whether two items belong together, using the matching threshold. */
export function sameStory(a: Clusterable, b: Clusterable): boolean {
  const usingEmbeddings = Boolean(a.embedding && b.embedding);
  const threshold = usingEmbeddings
    ? CLUSTER_EMBEDDING_THRESHOLD
    : CLUSTER_TITLE_THRESHOLD;
  return clusterSimilarity(a, b) >= threshold;
}

export interface Cluster<T extends Clusterable> {
  members: T[];
  /** True if any pair was matched on vectors rather than titles. */
  usedEmbeddings: boolean;
}

/**
 * Single-link agglomerative grouping over a time-ordered window.
 *
 * Each article joins the first existing cluster it matches *any* member of, so
 * a story can chain across rewordings — "OpenAI buys Foo" → "OpenAI acquires
 * Foo for $1B" → "Foo acquisition confirmed" — that no single pair of end
 * points would match directly.
 *
 * O(n²) in the window, which is fine at the few-thousand scale this runs at
 * and avoids needing a vector index for the title-similarity fallback.
 */
export function clusterArticles<T extends Clusterable>(
  articles: T[],
): Cluster<T>[] {
  const clusters: Cluster<T>[] = [];

  for (const article of articles) {
    let placed = false;

    for (const cluster of clusters) {
      // Two items from the same outlet are that outlet republishing, not
      // corroboration, but they still belong on the same story page.
      const match = cluster.members.some((member) => sameStory(member, article));
      if (!match) continue;

      cluster.members.push(article);
      if (article.embedding && cluster.members.some((m) => m.embedding)) {
        cluster.usedEmbeddings = true;
      }
      placed = true;
      break;
    }

    if (!placed) {
      clusters.push({ members: [article], usedEmbeddings: false });
    }
  }

  return clusters;
}

/** Mean vector, or null when no member carries one. */
export function centroidOf(vectors: (number[] | null | undefined)[]): number[] | null {
  const present = vectors.filter((v): v is number[] => Array.isArray(v) && v.length > 0);
  if (present.length === 0) return null;

  const dims = present[0].length;
  const sum = new Array<number>(dims).fill(0);

  for (const vector of present) {
    if (vector.length !== dims) continue;
    for (let i = 0; i < dims; i++) sum[i] += vector[i];
  }

  return sum.map((value) => value / present.length);
}
