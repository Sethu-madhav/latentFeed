import { describe, expect, it } from "vitest";
import { classify, isCaseStudy } from "@/lib/enrich/classify";
import { extractTags, normalizeTag } from "@/lib/enrich/tags";
import { matchOrgs, firstPartyOrg } from "@/lib/orgs";

describe("classify", () => {
  it("trusts fetcher hints over text", () => {
    expect(classify("anything at all", null, { isPaper: true })).toBe(
      "research-paper",
    );
    expect(classify("v1.2.3", null, { isRelease: true })).toBe("tool-launch");
    expect(
      classify("DeepSeek released X on Hugging Face", null, {
        isModelRelease: true,
      }),
    ).toBe("model-launch");
  });

  it("separates a launch from a leak about the same model", () => {
    expect(classify("Introducing GPT-5.6, our most capable model")).toBe(
      "model-launch",
    );
    expect(classify("GPT-6 spotted in ChatGPT web code, suggesting a launch")).toBe(
      "model-leak",
    );
  });

  it("recognises deals and compute buildouts", () => {
    expect(classify("Anthropic raises $8 billion at a $350 billion valuation")).toBe(
      "deal",
    );
    expect(
      classify("OpenAI signs 5 gigawatt data center deal with Oracle"),
    ).toBe("infra-compute");
  });

  it("recognises feature and people news", () => {
    expect(classify("Testing ads in ChatGPT")).toBe("feature-launch");
    expect(classify("OpenAI appoints Dali Rajic as Chief Revenue Officer")).toBe(
      "people",
    );
  });

  it("forces vendor case studies to other", () => {
    expect(classify("How Zapier transformed core marketing with ChatGPT Work")).toBe(
      "other",
    );
  });

  it("falls back to other", () => {
    expect(classify("A note on our office move")).toBe("other");
  });
});

describe("isCaseStudy", () => {
  it("matches regardless of leading capitalisation", () => {
    expect(isCaseStudy("How Zapier transformed core marketing processes")).toBe(
      true,
    );
  });

  it("does not catch genuine engineering write-ups", () => {
    expect(isCaseStudy("How we built a realtime voice system in six months")).toBe(
      false,
    );
  });
});

describe("matchOrgs", () => {
  it("maps product names to their owners", () => {
    expect(matchOrgs("Claude Code now supports subagents")).toContain(
      "anthropic",
    );
    expect(matchOrgs("Grok 5 tops the leaderboard")).toContain("xai");
    expect(matchOrgs("Kimi K2 weights are out")).toContain("moonshot");
  });

  it("respects word boundaries", () => {
    // "Grokking" is a training phenomenon, not xAI's chatbot.
    expect(matchOrgs("Grokking generalisation in small models")).not.toContain(
      "xai",
    );
  });

  it("infers the org from a first-party URL", () => {
    expect(matchOrgs("An untitled post", "https://openai.com/news/x")).toContain(
      "openai",
    );
  });

  it("orders primary labs ahead of secondary ones", () => {
    const orgs = matchOrgs("Microsoft and OpenAI extend their partnership");
    expect(orgs.indexOf("openai")).toBeLessThan(orgs.indexOf("microsoft"));
  });
});

describe("firstPartyOrg", () => {
  it("recognises a lab's own domain and subdomains", () => {
    expect(firstPartyOrg("https://www.anthropic.com/news/x")).toBe("anthropic");
    expect(firstPartyOrg("https://blogs.nvidia.com/x")).toBe("nvidia");
    expect(firstPartyOrg("https://techcrunch.com/x")).toBeNull();
  });
});

describe("extractTags", () => {
  it("pulls topics from the text", () => {
    const tags = extractTags("New reasoning model with open weights and 1M context");
    expect(tags).toContain("reasoning");
    expect(tags).toContain("open-weights");
    expect(tags).toContain("context-window");
  });

  it("merges fetcher-supplied keywords", () => {
    expect(extractTags("A paper", null, ["Chain of Thought"])).toContain(
      "chain-of-thought",
    );
  });

  it("caps the tag count", () => {
    expect(
      extractTags("x", null, Array.from({ length: 40 }, (_, i) => `tag${i}`)).length,
    ).toBeLessThanOrEqual(12);
  });
});

describe("normalizeTag", () => {
  it("kebab-cases and filters unusable input", () => {
    expect(normalizeTag("Test Time Compute")).toBe("test-time-compute");
    expect(normalizeTag("a")).toBeNull();
    expect(normalizeTag("a very long multi word phrase here")).toBeNull();
  });
});
