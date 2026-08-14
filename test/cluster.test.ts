import { describe, expect, it } from "vitest";
import {
  CLUSTER_TITLE_THRESHOLD,
  centroidOf,
  clusterArticles,
  clusterSimilarity,
  sameStory,
  type Clusterable,
} from "@/lib/enrich/cluster";
import { DUPLICATE_THRESHOLD } from "@/lib/enrich/dedup";
import { sameOutlet } from "@/worker/ingest";

let seq = 0;
function article(title: string, sourceId = ++seq, embedding?: number[]): Clusterable {
  return {
    id: `a${++seq}`,
    title,
    sourceId,
    publishedAt: new Date(2026, 0, 1, seq),
    embedding,
  };
}

describe("clustering thresholds", () => {
  it("is looser than dedup", () => {
    // Dedup drops an article on a match, so it must be conservative;
    // clustering only groups, so it can afford to reach further.
    expect(CLUSTER_TITLE_THRESHOLD).toBeLessThan(DUPLICATE_THRESHOLD);
  });
});

describe("sameStory", () => {
  it("groups differently-worded takes on one event", () => {
    expect(
      sameStory(
        article("Anthropic in talks to buy AI startup Decart for $6 billion"),
        article("Anthropic in talks to buy Decart, sources say"),
      ),
    ).toBe(true);
  });

  it("misses synonym rewrites without embeddings — a known limit", () => {
    // "buy" and "acquire" share no tokens, so headline overlap alone can't
    // connect these. The threshold is deliberately not lowered to catch it:
    // at 0.30 unrelated stories about the same company merge, and since
    // corroboration feeds credibility, a false merge inflates trust. This is
    // the case embeddings exist to fix.
    const a = article("Anthropic in talks to buy AI startup Decart for $6bn");
    const b = article("Anthropic reportedly in talks to acquire Decart");

    expect(sameStory(a, b)).toBe(false);
    expect(clusterSimilarity(a, b)).toBeLessThan(CLUSTER_TITLE_THRESHOLD);

    // With vectors on both sides the same pair groups fine.
    const embedded = sameStory(
      { ...a, embedding: [1, 0, 0] },
      { ...b, embedding: [0.97, 0.05, 0] },
    );
    expect(embedded).toBe(true);
  });

  it("keeps unrelated stories apart", () => {
    expect(
      sameStory(
        article("Anthropic in talks to buy Decart"),
        article("Nvidia reports record datacenter revenue"),
      ),
    ).toBe(false);
  });

  it("does not group two different stories about the same company", () => {
    expect(
      sameStory(
        article("OpenAI launches GPT-6 with faster reasoning"),
        article("OpenAI appoints a new chief revenue officer"),
      ),
    ).toBe(false);
  });

  it("uses vectors when both sides carry them", () => {
    const a = article("totally different words here", 1, [1, 0, 0]);
    const b = article("nothing alike whatsoever", 2, [0.99, 0.01, 0]);
    // Titles share nothing, but the vectors say it's the same event.
    expect(clusterSimilarity(a, b)).toBeGreaterThan(0.9);
    expect(sameStory(a, b)).toBe(true);
  });

  it("falls back to titles when only one side has a vector", () => {
    const a = article("OpenAI launches GPT-6", 1, [1, 0, 0]);
    const b = article("OpenAI launches GPT-6 today", 2);
    expect(sameStory(a, b)).toBe(true);
  });
});

describe("clusterArticles", () => {
  it("groups a story and leaves singletons alone", () => {
    const clusters = clusterArticles([
      article("Anthropic in talks to buy AI startup Decart"),
      article("Anthropic in talks to acquire startup Decart"),
      article("Nvidia announces Rubin architecture"),
    ]);

    expect(clusters).toHaveLength(2);
    expect(clusters.find((c) => c.members.length === 2)).toBeDefined();
    expect(clusters.find((c) => c.members.length === 1)).toBeDefined();
  });

  it("chains through intermediate wordings", () => {
    // A and C don't match directly, but both match B, so single-link
    // grouping keeps the whole story together.
    const a = article("OpenAI buys Foo");
    const b = article("OpenAI buys Foo for $1 billion");
    const c = article("OpenAI acquisition of Foo for $1 billion confirmed");

    expect(sameStory(a, c)).toBe(false);
    const clusters = clusterArticles([a, b, c]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].members).toHaveLength(3);
  });

  it("handles an empty input", () => {
    expect(clusterArticles([])).toEqual([]);
  });

  it("flags when embeddings were involved", () => {
    const plain = clusterArticles([
      article("OpenAI launches GPT-6"),
      article("OpenAI launches GPT-6 model"),
    ]);
    expect(plain[0].usedEmbeddings).toBe(false);
  });
});

describe("sameOutlet", () => {
  const feed = { id: 7 };

  it("treats two publishers behind one aggregator query as different outlets", () => {
    // A Google News query is a single source row but delivers many
    // publishers. Comparing feeds threw away real corroboration: one
    // syndicated story reached us from 11 local stations through one query.
    expect(
      sameOutlet(
        { sourceId: 7, publisherDomain: "kxan.com" },
        feed,
        { publisherDomain: "abc7amarillo.com" },
      ),
    ).toBe(false);
  });

  it("still catches one publisher repeating itself", () => {
    expect(
      sameOutlet(
        { sourceId: 7, publisherDomain: "kxan.com" },
        feed,
        { publisherDomain: "kxan.com" },
      ),
    ).toBe(true);
  });

  it("falls back to the feed when neither side names a publisher", () => {
    expect(sameOutlet({ sourceId: 7, publisherDomain: null }, feed, {})).toBe(
      true,
    );
    expect(sameOutlet({ sourceId: 9, publisherDomain: null }, feed, {})).toBe(
      false,
    );
  });

  it("counts an aggregator's copy of a direct feed as a separate outlet", () => {
    expect(
      sameOutlet({ sourceId: 3, publisherDomain: null }, feed, {
        publisherDomain: "theverge.com",
      }),
    ).toBe(false);
  });
});

describe("centroidOf", () => {
  it("averages the vectors present", () => {
    expect(centroidOf([[0, 2], [2, 0]])).toEqual([1, 1]);
  });

  it("ignores missing vectors", () => {
    expect(centroidOf([[2, 4], null, undefined])).toEqual([2, 4]);
  });

  it("returns null when nothing is embedded", () => {
    expect(centroidOf([null, undefined])).toBeNull();
    expect(centroidOf([])).toBeNull();
  });
});
