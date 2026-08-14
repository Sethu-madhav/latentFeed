import { describe, expect, it } from "vitest";
import {
  EMBEDDING_DIMS,
  SEMANTIC_DUPLICATE_DISTANCE,
  cosineSimilarity,
  embeddingText,
} from "@/lib/embeddings";
import { toVectorLiteral } from "@/worker/ingest";

describe("embeddingText", () => {
  it("combines title and summary", () => {
    expect(embeddingText("A title", "Some body")).toBe("A title\n\nSome body");
  });

  it("survives a missing summary", () => {
    expect(embeddingText("A title", null)).toBe("A title");
    expect(embeddingText("A title")).toBe("A title");
  });

  it("caps very long bodies", () => {
    const text = embeddingText("T", "x".repeat(5000));
    expect(text.length).toBeLessThanOrEqual(1200);
  });
});

describe("cosineSimilarity", () => {
  it("is 1 for identical vectors", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 6);
  });

  it("is 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 6);
  });

  it("is -1 for opposed vectors", () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1, 6);
  });

  it("ignores magnitude", () => {
    expect(cosineSimilarity([1, 1], [10, 10])).toBeCloseTo(1, 6);
  });

  it("returns 0 rather than NaN on degenerate input", () => {
    expect(cosineSimilarity([], [])).toBe(0);
    expect(cosineSimilarity([0, 0], [0, 0])).toBe(0);
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
  });
});

describe("toVectorLiteral", () => {
  it("formats as a pgvector literal", () => {
    expect(toVectorLiteral([0.1, -0.2, 3])).toBe("[0.1,-0.2,3]");
  });

  it("handles an empty vector", () => {
    expect(toVectorLiteral([])).toBe("[]");
  });
});

describe("dedup threshold", () => {
  it("sits where near-identical stories match but same-topic ones don't", () => {
    // Distance is 1 − cosine similarity, so the threshold must be small.
    expect(SEMANTIC_DUPLICATE_DISTANCE).toBeGreaterThan(0);
    expect(SEMANTIC_DUPLICATE_DISTANCE).toBeLessThan(0.3);
  });

  it("matches the declared column width", () => {
    expect(EMBEDDING_DIMS).toBe(1536);
  });
});
