import { describe, expect, it } from "vitest";
import { normalizeResponse } from "@/lib/enrich/llm";
import { scoreCredibility } from "@/lib/enrich/credibility";

const raw = {
  summary: "  OpenAI released a new model.  ",
  category: "model-launch",
  tags: ["Open Weights", "reasoning"],
  orgs: ["openai"],
  claim_status: "confirmed",
  status_reason: "OpenAI's own announcement post",
};

describe("normalizeResponse", () => {
  it("trims and passes through a well-formed response", () => {
    const result = normalizeResponse(raw);
    expect(result.summary).toBe("OpenAI released a new model.");
    expect(result.category).toBe("model-launch");
    expect(result.claimStatus).toBe("confirmed");
    expect(result.orgSlugs).toEqual(["openai"]);
  });

  it("normalises tags to kebab-case and dedupes", () => {
    const result = normalizeResponse({
      ...raw,
      tags: ["Open Weights", "open-weights", "REASONING"],
    });
    expect(result.tags).toContain("open-weights");
    expect(result.tags).toContain("reasoning");
    expect(new Set(result.tags).size).toBe(result.tags.length);
  });

  it("falls back to other for an unknown category", () => {
    expect(normalizeResponse({ ...raw, category: "invented" }).category).toBe(
      "other",
    );
  });

  it("falls back to reported for an unknown claim status", () => {
    expect(
      normalizeResponse({ ...raw, claim_status: "maybe" }).claimStatus,
    ).toBe("reported");
  });

  it("drops orgs it doesn't track", () => {
    expect(
      normalizeResponse({ ...raw, orgs: ["openai", "acme-corp"] }).orgSlugs,
    ).toEqual(["openai"]);
  });

  it("caps the tag count", () => {
    const tags = Array.from({ length: 30 }, (_, i) => `tag-${i}`);
    expect(normalizeResponse({ ...raw, tags }).tags.length).toBeLessThanOrEqual(
      8,
    );
  });

  it("tolerates empty arrays and blank strings", () => {
    const result = normalizeResponse({
      summary: "",
      category: "other",
      tags: [],
      orgs: [],
      claim_status: "reported",
      status_reason: "",
    });
    expect(result.summary).toBe("");
    expect(result.tags).toEqual([]);
    expect(result.statusReason).toBe("");
  });
});

describe("credibility with an LLM judgment", () => {
  const base = {
    url: "https://techcrunch.com/post",
    baseCredibility: 4,
    hasPublishDate: true,
    author: "A Writer",
  };

  it("docks hedging the keyword list misses", () => {
    const plain = scoreCredibility({
      ...base,
      title: "Engineers are evaluating a new internal system",
    });
    const judged = scoreCredibility({
      ...base,
      title: "Engineers are evaluating a new internal system",
      llm: {
        claimStatus: "unconfirmed",
        statusReason: "attributed to unnamed employees",
      },
    });

    expect(plain.score).toBe(4);
    expect(judged.score).toBe(3);
    expect(judged.reasons.map((r) => r.rule)).toContain("llm-unconfirmed");
    expect(judged.reasons.find((r) => r.rule === "llm-unconfirmed")?.detail).toBe(
      "attributed to unnamed employees",
    );
  });

  it("rescues a keyword false positive", () => {
    // "leaked" trips the hedging rule, but this is a published analysis of a
    // leak rather than an unverified claim about one.
    const title = "Anthropic publishes its analysis of leaked model weights";

    const hedged = scoreCredibility({ ...base, title });
    const rescued = scoreCredibility({
      ...base,
      title,
      llm: {
        claimStatus: "confirmed",
        statusReason: "first-party published analysis",
      },
    });

    expect(hedged.score).toBe(3);
    expect(rescued.score).toBe(4);
    expect(rescued.reasons.map((r) => r.rule)).toContain("llm-confirmed");
  });

  it("does not fire the hedge rule on words that merely contain 'leak'", () => {
    // Guards the narrowness of the pattern: "leakage" is not a rumour signal.
    const result = scoreCredibility({
      ...base,
      title: "Fingerprinting diffusion models against weight leakage",
    });
    expect(result.reasons.map((r) => r.rule)).not.toContain("hedged");
    expect(result.score).toBe(4);
  });

  it("does not double-dock when the keywords already caught it", () => {
    const result = scoreCredibility({
      ...base,
      title: "OpenAI reportedly preparing a new model",
      llm: { claimStatus: "unconfirmed", statusReason: "unnamed sources" },
    });
    const rules = result.reasons.map((r) => r.rule);
    expect(rules).toContain("hedged");
    expect(rules).not.toContain("llm-unconfirmed");
    expect(result.score).toBe(3);
  });

  it("leaves the score alone when the model says reported", () => {
    const without = scoreCredibility({ ...base, title: "A plain headline" });
    const with_ = scoreCredibility({
      ...base,
      title: "A plain headline",
      llm: { claimStatus: "reported", statusReason: "credible outlet" },
    });
    expect(with_.score).toBe(without.score);
  });

  it("still records every rule that fired", () => {
    const result = scoreCredibility({
      ...base,
      title: "Sources say a launch is close",
      llm: { claimStatus: "unconfirmed", statusReason: "unnamed sources" },
    });
    expect(result.reasons.length).toBeGreaterThan(0);
    expect(result.reasons.every((r) => typeof r.rule === "string")).toBe(true);
  });
});
