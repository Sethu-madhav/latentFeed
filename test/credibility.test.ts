import { describe, expect, it } from "vitest";
import { scoreCredibility, tierForDomain } from "@/lib/enrich/credibility";

const base = {
  url: "https://example.com/post",
  baseCredibility: 3,
  hasPublishDate: true,
};

describe("tierForDomain", () => {
  it("rates known publishers", () => {
    expect(tierForDomain("wsj.com")).toBe(5);
    expect(tierForDomain("testingcatalog.com")).toBe(1);
  });

  it("matches subdomains and ignores www", () => {
    expect(tierForDomain("www.wsj.com")).toBe(5);
    expect(tierForDomain("blogs.wsj.com")).toBe(5);
  });

  it("returns null for unknown publishers", () => {
    expect(tierForDomain("some-content-farm.example")).toBeNull();
  });
});

describe("scoreCredibility", () => {
  it("uses the source's base score by default", () => {
    const r = scoreCredibility({ ...base, title: "A routine update" });
    expect(r.score).toBe(3);
    expect(r.isRumour).toBe(false);
  });

  it("promotes first-party announcements", () => {
    const r = scoreCredibility({
      ...base,
      title: "Introducing our new model",
      url: "https://openai.com/news/new-model",
      baseCredibility: 4,
    });
    expect(r.score).toBe(5);
    expect(r.reasons.map((x) => x.rule)).toContain("first-party");
  });

  it("docks hedged reporting", () => {
    const r = scoreCredibility({
      ...base,
      title: "OpenAI reportedly preparing a new model",
      baseCredibility: 4,
    });
    expect(r.score).toBe(3);
    expect(r.reasons.map((x) => x.rule)).toContain("hedged");
  });

  it("grades the real publisher behind an aggregator, not the feed", () => {
    const wsj = scoreCredibility({
      ...base,
      title: "Anthropic raises at a new valuation",
      publisherDomain: "wsj.com",
      baseCredibility: 3,
    });
    const leak = scoreCredibility({
      ...base,
      title: "Anthropic raises at a new valuation",
      publisherDomain: "testingcatalog.com",
      baseCredibility: 3,
    });
    expect(wsj.score).toBe(5);
    expect(leak.score).toBe(1);
  });

  it("defaults unrated aggregator publishers to the middle", () => {
    const r = scoreCredibility({
      ...base,
      title: "Some coverage",
      publisherDomain: "unknown-outlet.example",
      baseCredibility: 5,
    });
    expect(r.score).toBe(3);
  });

  it("lets corroboration lift a hedged story", () => {
    const alone = scoreCredibility({
      ...base,
      title: "Sources say a new model is coming",
      baseCredibility: 3,
    });
    const backed = scoreCredibility({
      ...base,
      title: "Sources say a new model is coming",
      baseCredibility: 3,
      corroborationCount: 4,
    });
    expect(alone.score).toBe(2);
    expect(backed.score).toBe(3);
    expect(backed.reasons.map((x) => x.rule)).toContain("corroborated");
  });

  it("flags 1–2 as rumour and clamps to the 1–5 range", () => {
    const r = scoreCredibility({
      ...base,
      title: "Rumoured leak of an unreleased model",
      baseCredibility: 1,
      author: null,
      hasPublishDate: false,
    });
    expect(r.score).toBe(1);
    expect(r.isRumour).toBe(true);
  });

  it("always records why", () => {
    const r = scoreCredibility({
      ...base,
      title: "Reportedly shipping soon",
      baseCredibility: 4,
    });
    expect(r.reasons.length).toBeGreaterThan(0);
    expect(r.reasons.every((x) => typeof x.rule === "string")).toBe(true);
  });
});
