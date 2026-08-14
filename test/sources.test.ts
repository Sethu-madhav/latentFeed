import { describe, expect, it } from "vitest";
import {
  detectKind,
  humanizeProbeError,
  slugify,
  uniqueSlug,
} from "@/lib/sources/validate";
import { CATEGORY_ORDER, KIND_LABELS } from "@/lib/sources/labels";
import { SOURCE_REGISTRY } from "@/lib/sources/registry";

describe("detectKind", () => {
  it("routes each URL shape to its fetcher", () => {
    expect(detectKind("https://news.google.com/rss/search?q=x")).toBe(
      "google_news",
    );
    expect(detectKind("https://github.com/a/b/releases.atom")).toBe(
      "github_releases",
    );
    expect(detectKind("https://rss.arxiv.org/rss/cs.CL")).toBe("arxiv");
    expect(detectKind("https://huggingface.co/api/daily_papers")).toBe(
      "hf_papers",
    );
    expect(detectKind("https://huggingface.co/api/models?author=Qwen")).toBe(
      "hf_models",
    );
    expect(detectKind("https://hn.algolia.com/api/v1/search_by_date")).toBe(
      "hn",
    );
    expect(detectKind("https://www.reddit.com/r/LocalLLaMA/.rss")).toBe(
      "reddit",
    );
  });

  it("falls back to rss", () => {
    expect(detectKind("https://example.com/feed.xml")).toBe("rss");
  });

  it("prefers releases.atom over the generic github case", () => {
    // Both patterns could match a github.com URL; the release feed must win.
    expect(detectKind("https://github.com/openai/codex/releases.atom")).toBe(
      "github_releases",
    );
  });

  it("is case-insensitive", () => {
    expect(detectKind("HTTPS://NEWS.GOOGLE.COM/RSS/search?q=x")).toBe(
      "google_news",
    );
  });
});

describe("humanizeProbeError", () => {
  it("explains an HTML page pasted as a feed", () => {
    const message = humanizeProbeError(
      new Error("Unexpected close tag Line: 0 Column: 332 Char: >"),
    );
    expect(message).toMatch(/web page, not a feed/i);
    expect(message).not.toMatch(/Column: 332/);
  });

  it("adds context to HTTP failures", () => {
    expect(humanizeProbeError(new Error("HTTP 403 for https://x"))).toMatch(
      /refusing automated requests/i,
    );
    expect(humanizeProbeError(new Error("HTTP 404 for https://x"))).toMatch(
      /probably moved/i,
    );
    expect(humanizeProbeError(new Error("HTTP 429 for https://x"))).toMatch(
      /rate limited/i,
    );
  });

  it("explains DNS and timeout failures", () => {
    expect(humanizeProbeError(new Error("getaddrinfo ENOTFOUND nope"))).toMatch(
      /could not be resolved/i,
    );
    expect(humanizeProbeError(new Error("The operation was aborted"))).toMatch(
      /timed out/i,
    );
  });

  it("passes through anything it doesn't recognise", () => {
    expect(humanizeProbeError(new Error("something novel"))).toBe(
      "something novel",
    );
  });
});

describe("slugify", () => {
  it("produces a URL-safe slug", () => {
    expect(slugify("Latent Space")).toBe("latent-space");
    expect(slugify("Ars Technica — AI")).toBe("ars-technica-ai");
    expect(slugify("  Z.AI (GLM)  ")).toBe("z-ai-glm");
  });

  it("never returns empty", () => {
    expect(slugify("!!!")).toBe("source");
    expect(slugify("")).toBe("source");
  });
});

describe("uniqueSlug", () => {
  it("returns the base when free", () => {
    expect(uniqueSlug("verge", new Set())).toBe("verge");
  });

  it("suffixes on collision", () => {
    expect(uniqueSlug("verge", new Set(["verge"]))).toBe("verge-2");
    expect(uniqueSlug("verge", new Set(["verge", "verge-2"]))).toBe("verge-3");
  });
});

describe("source registry", () => {
  it("has unique slugs", () => {
    const slugs = SOURCE_REGISTRY.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("has unique feed URLs", () => {
    const urls = SOURCE_REGISTRY.map((s) => s.feedUrl);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("keeps every credibility inside 1–5", () => {
    for (const s of SOURCE_REGISTRY) {
      expect(s.baseCredibility).toBeGreaterThanOrEqual(1);
      expect(s.baseCredibility).toBeLessThanOrEqual(5);
    }
  });

  it("uses only categories the UI can group", () => {
    for (const s of SOURCE_REGISTRY) {
      expect(CATEGORY_ORDER).toContain(s.category);
    }
  });

  it("uses only kinds the dispatcher handles", () => {
    for (const s of SOURCE_REGISTRY) {
      expect(Object.keys(KIND_LABELS)).toContain(s.kind);
    }
  });

  it("declares a kind consistent with its URL where detection is unambiguous", () => {
    for (const s of SOURCE_REGISTRY) {
      const detected = detectKind(s.feedUrl);
      // `rss` is the catch-all, so only assert when detection is specific.
      if (detected !== "rss") expect(s.kind).toBe(detected);
    }
  });
});
