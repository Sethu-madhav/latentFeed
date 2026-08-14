import { describe, expect, it } from "vitest";
import { deriveStatus, extractModels } from "@/lib/enrich/models";

const slugs = (text: string) => extractModels(text).map((m) => m.slug);

describe("extractModels", () => {
  it("normalises the many spellings of one release", () => {
    // All of these are Qwen 3.8 and must collapse to a single radar entry.
    for (const text of [
      "Qwen3.8-27B is here",
      "Qwen 3.8 27b is here",
      "Qwen/Qwen3.8-27B · released",
      "unsloth/Qwen3.8-27B-GGUF",
      "Alibaba releases weights for Qwen3.8 models",
    ]) {
      expect(slugs(text)).toContain("qwen-3.8");
    }
  });

  it("keeps size variants out of the identity", () => {
    // 27B and 9B are two builds of one release, not two models.
    expect(slugs("Qwen3.8-27B")).toEqual(slugs("Qwen3.8-9B"));
  });

  it("keeps named tiers in the identity", () => {
    // Flash and Pro genuinely are different models.
    expect(slugs("Gemini 3.7 Flash")).not.toEqual(slugs("Gemini 3.7 Pro"));
    expect(slugs("DeepSeek V4 Flash")).not.toEqual(slugs("DeepSeek V4 Pro"));
  });

  it("handles a tier before the version", () => {
    // Anthropic writes "Claude Opus 4.8"; Google writes "Gemini 3.7 Flash".
    expect(slugs("Anthropic announces Claude Opus 4.8")).toEqual([
      "claude-4.8-opus",
    ]);
  });

  it("handles series letters", () => {
    expect(slugs("Kimi K3 released")).toEqual(["kimi-k3"]);
    expect(slugs("DeepSeek-V4-Pro-0813")).toEqual(["deepseek-v4-pro"]);
  });

  it("drops dated build suffixes", () => {
    expect(slugs("DeepSeek V4 Flash 0731")).toEqual(["deepseek-v4-flash"]);
  });

  it("finds every model in a roundup", () => {
    expect(
      slugs("Less Than a Month: Kimi K3, Qwen3.8, DeepSeek-V4-Pro-0813, GLM-5.3"),
    ).toEqual(["kimi-k3", "qwen-3.8", "deepseek-v4-pro", "glm-5.3"]);
  });

  it("requires a version — a product line is not a release", () => {
    expect(slugs("Anthropic improves Claude")).toEqual([]);
    expect(slugs("OpenAI and GPT are everywhere")).toEqual([]);
  });

  it("ignores tools that look like versioned models", () => {
    // "Claude Code v2.1.232" is a CLI release, and used to appear on the
    // radar as a phantom model with ten mentions.
    expect(slugs("anthropics/claude-code v2.1.232")).toEqual([]);
    expect(slugs("Claude Code is leaking real email addresses")).toEqual([]);
  });

  it("does not treat a year as a version", () => {
    expect(slugs("Gemini 2024 retrospective")).toEqual([]);
  });

  it("attributes models to the right company", () => {
    const [kimi] = extractModels("Kimi K3");
    expect(kimi.orgSlug).toBe("moonshot");
    const [glm] = extractModels("GLM-5.3");
    expect(glm.orgSlug).toBe("zai");
  });

  it("produces a readable display name", () => {
    expect(extractModels("DeepSeek-V4-Pro-0813")[0].name).toBe("DeepSeek V4 Pro");
    expect(extractModels("Qwen3.8-27B")[0].name).toBe("Qwen 3.8");
    expect(extractModels("Claude Opus 4.8")[0].name).toBe("Claude Opus 4.8");
  });
});

describe("deriveStatus", () => {
  const base = { hasFirstPartyRelease: false, topCredibility: 1, sourceCount: 1 };

  it("needs first-party proof to call something released", () => {
    expect(deriveStatus({ ...base, hasFirstPartyRelease: true })).toBe("released");
  });

  it("never promotes rumour to released, however loud", () => {
    // Volume of coverage is corroboration, not shipping.
    expect(
      deriveStatus({ ...base, topCredibility: 5, sourceCount: 40 }),
    ).toBe("confirmed");
  });

  it("grades the middle by evidence", () => {
    expect(deriveStatus({ ...base, topCredibility: 4 })).toBe("confirmed");
    expect(deriveStatus({ ...base, topCredibility: 3 })).toBe("reported");
    expect(deriveStatus({ ...base, sourceCount: 2 })).toBe("reported");
  });

  it("leaves a lone low-credibility sighting as rumour", () => {
    expect(deriveStatus(base)).toBe("rumoured");
  });
});

describe("size and stat guards", () => {
  it("does not read a parameter count as a version", () => {
    // "Qwen 30b MoE" put a phantom "Qwen 30" on the radar.
    expect(slugs("Qwen 30b MoE - 30tps - 6GB vram")).toEqual([]);
    expect(slugs("Llama 70B released")).toEqual([]);
  });

  it("still reads a real version followed by a size", () => {
    expect(slugs("Qwen3.5-9B quants")).toEqual(["qwen-3.5"]);
    expect(slugs("Qwen3.8-27B")).toEqual(["qwen-3.8"]);
  });

  it("rejects implausibly large whole-number versions", () => {
    expect(slugs("Qwen 30")).toEqual([]);
    expect(slugs("GPT 4")).toEqual(["gpt-4"]);
  });
});
