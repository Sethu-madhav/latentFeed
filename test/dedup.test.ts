import { describe, expect, it } from "vitest";
import {
  canonicalizeUrl,
  findDuplicate,
  titleSimilarity,
} from "@/lib/enrich/dedup";

describe("canonicalizeUrl", () => {
  it("strips tracking params but keeps meaningful ones", () => {
    expect(
      canonicalizeUrl("https://example.com/post?utm_source=x&id=42&fbclid=abc"),
    ).toBe("https://example.com/post?id=42");
  });

  it("normalises host, scheme, trailing slash and fragment", () => {
    expect(canonicalizeUrl("http://WWW.Example.com/post/#section")).toBe(
      "https://example.com/post",
    );
  });

  it("collapses AMP paths", () => {
    expect(canonicalizeUrl("https://example.com/post/amp/")).toBe(
      "https://example.com/post",
    );
  });

  it("sorts params so ordering doesn't create a second row", () => {
    expect(canonicalizeUrl("https://example.com/p?b=2&a=1")).toBe(
      canonicalizeUrl("https://example.com/p?a=1&b=2"),
    );
  });

  it("passes through unparseable input untouched", () => {
    expect(canonicalizeUrl("not a url")).toBe("not a url");
  });
});

describe("titleSimilarity", () => {
  it("scores the same story from two outlets as similar", () => {
    const score = titleSimilarity(
      "OpenAI launches GPT-5.6 with faster reasoning",
      "OpenAI launches GPT-5.6, promising faster reasoning",
    );
    expect(score).toBeGreaterThan(0.6);
  });

  it("keeps unrelated headlines apart", () => {
    const score = titleSimilarity(
      "OpenAI launches GPT-5.6",
      "Nvidia reports record datacenter revenue",
    );
    expect(score).toBeLessThan(0.2);
  });

  it("ignores stopword-only overlap", () => {
    expect(
      titleSimilarity("The new is here for you", "A new one is for us"),
    ).toBeLessThan(0.5);
  });
});

describe("findDuplicate", () => {
  const existing = [
    { title: "Anthropic ships Claude with computer use", id: "a" },
    { title: "Nvidia announces Rubin architecture", id: "b" },
  ];

  it("finds the closest match above the threshold", () => {
    const hit = findDuplicate(
      "Anthropic ships Claude with computer use support",
      existing,
    );
    expect(hit?.match.id).toBe("a");
  });

  it("returns null when nothing is close enough", () => {
    expect(findDuplicate("Meta open-sources a new speech model", existing)).toBeNull();
  });
});
