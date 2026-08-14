import { describe, expect, it } from "vitest";
import { asText } from "@/lib/fetching/http";
import {
  publisherUrlsByLink,
  stripPublisherSuffix,
} from "@/lib/fetching/google-news";
import { cleanRedditBody } from "@/lib/fetching/reddit";
import { isDerivativeVariant } from "@/lib/fetching/hf-models";
import { cleanAbstract, arxivIdFrom } from "@/lib/fetching/arxiv";
import { repoFromFeedUrl, tagFromReleaseUrl } from "@/lib/fetching/github-releases";

describe("asText", () => {
  it("passes strings through and trims", () => {
    expect(asText("  hello  ")).toBe("hello");
    expect(asText("")).toBeUndefined();
  });

  it("unwraps xml2js element objects", () => {
    expect(asText({ _: "Jane Doe", $: { role: "author" } })).toBe("Jane Doe");
  });

  it("takes the first usable entry of an array", () => {
    expect(asText(["", "second"])).toBe("second");
  });

  it("survives null-prototype objects", () => {
    // This is what an empty <dc:creator/> parses to, and passing it to the
    // driver takes down the whole feed.
    const empty = Object.create(null) as Record<string, unknown>;
    expect(asText(empty)).toBeUndefined();
  });

  it("handles null and undefined", () => {
    expect(asText(null)).toBeUndefined();
    expect(asText(undefined)).toBeUndefined();
  });
});

describe("publisherUrlsByLink", () => {
  it("recovers the source URL attribute rss-parser drops", () => {
    const xml = `<rss><channel>
      <item>
        <title>Story one - WSJ</title>
        <link>https://news.google.com/rss/articles/AAA</link>
        <source url="https://www.wsj.com">WSJ</source>
      </item>
      <item>
        <title>Story two - The Verge</title>
        <link>https://news.google.com/rss/articles/BBB</link>
        <source url="https://www.theverge.com">The Verge</source>
      </item>
    </channel></rss>`;

    const map = publisherUrlsByLink(xml);
    expect(map.get("https://news.google.com/rss/articles/AAA")).toBe(
      "https://www.wsj.com",
    );
    expect(map.get("https://news.google.com/rss/articles/BBB")).toBe(
      "https://www.theverge.com",
    );
  });

  it("returns an empty map for feeds without source elements", () => {
    expect(publisherUrlsByLink("<rss><channel></channel></rss>").size).toBe(0);
  });
});

describe("stripPublisherSuffix", () => {
  it("removes the exact publisher suffix", () => {
    expect(stripPublisherSuffix("Anthropic raises again - WSJ", "WSJ")).toBe(
      "Anthropic raises again",
    );
  });

  it("leaves hyphenated titles with no publisher alone", () => {
    expect(stripPublisherSuffix("GPT-5.6 is here", "WSJ")).toBe("GPT-5.6 is here");
  });
});

describe("cleanRedditBody", () => {
  it("strips submission chrome", () => {
    expect(
      cleanRedditBody("submitted by /u/someone [link] [comments]"),
    ).toBe("");
  });

  it("keeps real post text", () => {
    expect(
      cleanRedditBody("Benchmarks look strong. submitted by /u/x [comments]"),
    ).toBe("Benchmarks look strong.");
  });
});

describe("isDerivativeVariant", () => {
  it("filters quantisations and format spins", () => {
    expect(isDerivativeVariant("zai-org/GLM-5.2-FP8")).toBe(true);
    expect(isDerivativeVariant("org/Model-GGUF")).toBe(true);
    expect(isDerivativeVariant("org/Model-AWQ")).toBe(true);
  });

  it("keeps the base release", () => {
    expect(isDerivativeVariant("zai-org/GLM-5.2")).toBe(false);
    expect(isDerivativeVariant("deepseek-ai/DeepSeek-V4-Pro-0813")).toBe(false);
  });
});

describe("arxiv helpers", () => {
  it("strips the announce-type preamble", () => {
    expect(
      cleanAbstract("arXiv:2501.12345v1 Announce Type: new Abstract: We propose…"),
    ).toBe("We propose…");
  });

  it("extracts the paper id", () => {
    expect(arxivIdFrom("https://arxiv.org/abs/2501.12345")).toBe("2501.12345");
    expect(arxivIdFrom("https://example.com/x")).toBeNull();
  });
});

describe("github release helpers", () => {
  it("derives the repo and tag", () => {
    expect(
      repoFromFeedUrl("https://github.com/vllm-project/vllm/releases.atom"),
    ).toBe("vllm-project/vllm");
    expect(
      tagFromReleaseUrl("https://github.com/a/b/releases/tag/v1.2.3"),
    ).toBe("v1.2.3");
  });
});
