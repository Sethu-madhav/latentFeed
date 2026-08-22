import { describe, expect, it } from "vitest";
import { SOURCE_REGISTRY } from "@/lib/sources/registry";

/**
 * The leak feeds are query strings, so their bugs are silent: a wrong model
 * name still returns a healthy-looking hundred items, just of the wrong thing.
 * These pin the two mistakes that actually happened.
 */
const leaks = SOURCE_REGISTRY.filter((s) => s.category === "leaks");
const unreleased = leaks.find((s) => s.slug === "gnews-unreleased-models")!;
const query = decodeURIComponent(new URL(unreleased.feedUrl).searchParams.get("q") ?? "");

describe("leak sources", () => {
  it("has more than the single hand-picked leaks feed", () => {
    expect(leaks.length).toBeGreaterThan(1);
  });

  it("excludes the NASA Gemini mission", () => {
    // "Gemini 4" flew in 1965; Britannica's spacewalk write-up scored 3/5 on
    // its way into the feed before this exclusion existed.
    expect(query).toContain("-NASA");
    expect(query).toContain("-spacewalk");
  });

  it("names no model that has already shipped", () => {
    // A shipped name stops being a rumour and turns the feed into ordinary
    // launch coverage — Kimi K3 did exactly that, filling 9 of 11 results.
    for (const shipped of ["Kimi K3", "Claude 5", "GPT 5.6", "Qwen 3.8"]) {
      expect(query).not.toContain(`"${shipped}"`);
    }
  });

  it("does not match on bare 'leak', which is mostly data breaches", () => {
    const frontier = leaks.find((s) => s.slug === "gnews-frontier-leaks")!;
    const q = decodeURIComponent(new URL(frontier.feedUrl).searchParams.get("q") ?? "");
    expect(q).not.toMatch(/\bleak\b(?!ed)/);
    expect(q).toContain("sources say");
  });
});
