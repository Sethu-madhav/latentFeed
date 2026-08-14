import { describe, expect, it } from "vitest";
import {
  dedupeByStory,
  fallbackDigest,
  renderDigest,
  type DigestCandidate,
} from "@/worker/digest";

const candidate = (over: Partial<DigestCandidate> = {}): DigestCandidate => ({
  id: "a1",
  title: "A launch",
  summary: "Something shipped.",
  url: "https://example.com/a",
  category: "model-launch",
  credibility: 5,
  impact: 60,
  orgSlugs: ["openai"],
  storyId: null,
  sourceName: "The Verge",
  ...over,
});

describe("dedupeByStory", () => {
  it("keeps one article per cluster", () => {
    // A launch covered by 20 outlets would otherwise fill the whole brief.
    const rows = [
      { id: "a", storyId: "s1" },
      { id: "b", storyId: "s1" },
      { id: "c", storyId: "s2" },
    ];
    expect(dedupeByStory(rows).map((r) => r.id)).toEqual(["a", "c"]);
  });

  it("keeps every unclustered article", () => {
    const rows = [
      { id: "a", storyId: null },
      { id: "b", storyId: null },
    ];
    expect(dedupeByStory(rows)).toHaveLength(2);
  });

  it("relies on input order for which member survives", () => {
    // Callers sort by impact first, so the first seen is the best one.
    const rows = [
      { id: "high", storyId: "s1" },
      { id: "low", storyId: "s1" },
    ];
    expect(dedupeByStory(rows)[0].id).toBe("high");
  });
});

describe("renderDigest", () => {
  const candidates = [candidate({ id: "a1" }), candidate({ id: "a2" })];

  it("renders headings, body and citations", () => {
    const out = renderDigest(
      {
        title: "A quiet day",
        intro: "Not much happened.",
        items: [{ headline: "One thing", body: "It happened.", article_ids: ["a1"] }],
      },
      candidates,
      "gpt-5.4-mini",
    );

    expect(out.title).toBe("A quiet day");
    expect(out.bodyMarkdown).toContain("### One thing");
    expect(out.bodyMarkdown).toContain("https://example.com/a");
    expect(out.articleIds).toEqual(["a1"]);
  });

  it("drops citations that were never in the candidate set", () => {
    // The brief must not reference an article we never showed the model.
    const out = renderDigest(
      {
        title: "T",
        intro: "I",
        items: [
          { headline: "H", body: "B", article_ids: ["a1", "hallucinated-id"] },
        ],
      },
      candidates,
      "gpt-5.4-mini",
    );

    expect(out.articleIds).toEqual(["a1"]);
    expect(out.bodyMarkdown).not.toContain("hallucinated-id");
  });

  it("survives an item citing nothing", () => {
    const out = renderDigest(
      { title: "T", intro: "I", items: [{ headline: "H", body: "B", article_ids: [] }] },
      candidates,
      "m",
    );
    expect(out.articleIds).toEqual([]);
    expect(out.bodyMarkdown).toContain("### H");
  });
});

describe("fallbackDigest", () => {
  it("produces a usable brief with no model", () => {
    const out = fallbackDigest([candidate({ id: "a1" }), candidate({ id: "a2" })]);
    expect(out.model).toBe("heuristic");
    expect(out.articleIds).toEqual(["a1", "a2"]);
    expect(out.bodyMarkdown).toContain("Generated without a model");
  });

  it("caps how many it lists", () => {
    const many = Array.from({ length: 25 }, (_, i) => candidate({ id: `a${i}` }));
    expect(fallbackDigest(many).articleIds).toHaveLength(8);
  });
});
