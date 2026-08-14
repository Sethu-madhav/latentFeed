import { describe, expect, it } from "vitest";
import {
  cadenceLabel,
  parseTag,
  projectName,
  releasesPerWeek,
  repoFromReleaseUrl,
  tagFromUrl,
} from "@/lib/releases";

describe("repoFromReleaseUrl", () => {
  it("pulls the repo out of a release URL", () => {
    expect(
      repoFromReleaseUrl("https://github.com/ggml-org/llama.cpp/releases/tag/b10434"),
    ).toBe("ggml-org/llama.cpp");
  });

  it("returns null for anything else", () => {
    expect(repoFromReleaseUrl("https://example.com/post")).toBeNull();
    expect(repoFromReleaseUrl("https://github.com/owner/repo")).toBeNull();
  });
});

describe("tagFromUrl", () => {
  it("keeps the whole tag, prefixes and all", () => {
    expect(
      tagFromUrl("https://github.com/openai/codex/releases/tag/rust-v0.148.0-alpha.17"),
    ).toBe("rust-v0.148.0-alpha.17");
  });

  it("decodes escaped characters", () => {
    expect(tagFromUrl("https://github.com/a/b/releases/tag/v1%2E0")).toBe("v1.0");
  });
});

describe("parseTag", () => {
  it("handles plain semver", () => {
    expect(parseTag("v2.1.232")).toMatchObject({
      version: "2.1.232",
      isPrerelease: false,
      isBuild: false,
    });
  });

  it("strips a monorepo component prefix", () => {
    // Codex tags releases as "rust-v0.148.0-alpha.17".
    const parsed = parseTag("rust-v0.148.0-alpha.17");
    expect(parsed.version).toBe("0.148.0-alpha.17");
    expect(parsed.channel).toBe("alpha");
    expect(parsed.isPrerelease).toBe(true);
  });

  it("catches a release candidate with no separator", () => {
    // vllm writes "v0.27.2rc0", not "v0.27.2-rc0".
    const parsed = parseTag("v0.27.2rc0");
    expect(parsed.channel).toBe("rc");
    expect(parsed.isPrerelease).toBe(true);
  });

  it("recognises build counters as builds, not versions", () => {
    // llama.cpp ships "b10434" many times a day.
    const parsed = parseTag("b10434");
    expect(parsed.isBuild).toBe(true);
    expect(parsed.isPrerelease).toBe(false);
  });

  it("does not read a build counter as a prerelease", () => {
    // "b10434" contains no channel word, but a naive check on the leading
    // letter would call it a beta.
    expect(parseTag("b10434").channel).toBeNull();
  });
});

describe("projectName", () => {
  it("drops the owner", () => {
    expect(projectName("ggml-org/llama.cpp")).toBe("llama.cpp");
    expect(projectName("anthropics/claude-code")).toBe("claude-code");
  });
});

describe("releasesPerWeek", () => {
  const day = (n: number) => new Date(2026, 0, n);

  it("computes a rate across the observed span", () => {
    // 8 releases spread over 7 days ≈ 8 per week.
    const dates = [1, 2, 3, 4, 5, 6, 7, 8].map(day);
    expect(releasesPerWeek(dates)).toBeCloseTo(8, 0);
  });

  it("returns 0 when there is nothing to measure", () => {
    expect(releasesPerWeek([])).toBe(0);
    expect(releasesPerWeek([day(1)])).toBe(0);
  });

  it("returns 0 rather than infinity when everything lands at once", () => {
    const same = new Date(2026, 0, 1);
    expect(releasesPerWeek([same, same, same])).toBe(0);
  });
});

describe("cadenceLabel", () => {
  it("describes the rate in words", () => {
    expect(cadenceLabel(0)).toBe("—");
    expect(cadenceLabel(20)).toBe("multiple daily");
    expect(cadenceLabel(7)).toBe("~daily");
    expect(cadenceLabel(2)).toBe("few per week");
    expect(cadenceLabel(1)).toBe("~weekly");
    expect(cadenceLabel(0.2)).toBe("occasional");
  });
});
