import { describe, expect, it } from "vitest";
import { enrich, scoreImpact, usefulSummary } from "@/lib/enrich";
import { stripHtml } from "@/lib/fetching/http";

describe("stripHtml", () => {
  it("decodes both decimal and hex numeric entities", () => {
    expect(stripHtml("Elon Musk&#x27;s company")).toBe("Elon Musk's company");
    expect(stripHtml("don&#8217;t")).toBe("don’t");
  });

  it("removes markup and collapses whitespace", () => {
    expect(stripHtml("<p>Hello   <b>world</b></p>")).toBe("Hello world");
  });

  it("drops script and style content", () => {
    expect(stripHtml("<script>evil()</script>text")).toBe("text");
  });
});

describe("usefulSummary", () => {
  it("drops a summary that restates the title", () => {
    expect(usefulSummary("Grok 4.6 is here", "Grok 4.6 is here")).toBeNull();
  });

  it("drops a title with the publisher appended", () => {
    expect(
      usefulSummary("Grok 4.6 is here", "Grok 4.6 is here  Yahoo Finance"),
    ).toBeNull();
  });

  it("keeps a real summary", () => {
    expect(
      usefulSummary("Grok 4.6 is here", "xAI says the model tops several evals."),
    ).toBe("xAI says the model tops several evals.");
  });

  it("handles empty content", () => {
    expect(usefulSummary("A title", null)).toBeNull();
    expect(usefulSummary("A title", "   ")).toBeNull();
  });
});

describe("enrich", () => {
  it("classifies, scores and tags a first-party launch", () => {
    const result = enrich({
      item: {
        url: "https://openai.com/news/introducing-gpt-6",
        title: "Introducing GPT-6, our most capable reasoning model",
        publishedAt: new Date(),
        content: "A new frontier model with open weights and a 1M context window.",
      },
      baseCredibility: 5,
      sourceOrgSlug: "openai",
    });

    expect(result.category).toBe("model-launch");
    expect(result.credibility).toBe(5);
    expect(result.isRumour).toBe(false);
    expect(result.orgSlugs).toContain("openai");
    expect(result.tags).toContain("reasoning");
  });

  it("quarantines a datamined leak", () => {
    const result = enrich({
      item: {
        url: "https://www.testingcatalog.com/gemini-4-spotted",
        title: "Gemini 4 spotted in datamined strings, hinting at a launch",
        publishedAt: new Date(),
      },
      baseCredibility: 1,
    });

    expect(result.category).toBe("model-leak");
    expect(result.credibility).toBe(1);
    expect(result.isRumour).toBe(true);
    expect(result.orgSlugs).toContain("google");
  });

  it("adds the source's org even when the text never names it", () => {
    const result = enrich({
      item: {
        url: "https://example.com/x",
        title: "A post with no company mentioned",
        publishedAt: new Date(),
      },
      baseCredibility: 3,
      sourceOrgSlug: "anthropic",
    });
    expect(result.orgSlugs).toContain("anthropic");
  });
});

describe("scoreImpact", () => {
  const base = {
    credibility: 5,
    orgSlugs: ["openai"],
    corroborationCount: 0,
    meta: {},
  };

  it("ranks a model launch above a routine policy post", () => {
    expect(scoreImpact({ ...base, category: "model-launch" })).toBeGreaterThan(
      scoreImpact({ ...base, category: "policy" }),
    );
  });

  it("damps vendor case studies", () => {
    const normal = scoreImpact({ ...base, category: "other" });
    const study = scoreImpact({ ...base, category: "other", isCaseStudy: true });
    expect(study).toBeLessThan(normal);
  });

  it("rewards corroboration and community signal", () => {
    const alone = scoreImpact({ ...base, category: "deal" });
    const backed = scoreImpact({
      ...base,
      category: "deal",
      corroborationCount: 5,
      meta: { points: 400 },
    });
    expect(backed).toBeGreaterThan(alone);
  });

  it("stays within 0–100", () => {
    const max = scoreImpact({
      category: "model-launch",
      credibility: 5,
      orgSlugs: ["openai", "anthropic", "google", "nvidia"],
      corroborationCount: 20,
      meta: { points: 5000, upvotes: 900 },
    });
    expect(max).toBeLessThanOrEqual(100);
    expect(max).toBeGreaterThanOrEqual(0);
  });
});
