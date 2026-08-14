import { describe, expect, it } from "vitest";
import {
  FEED_PATH,
  buildQuery,
  hasActiveFilters,
  parseFilters,
} from "@/lib/filters";

const empty = parseFilters({});

describe("parseFilters", () => {
  it("defaults sensibly", () => {
    expect(empty.categories).toEqual([]);
    expect(empty.minCredibility).toBe(1);
    expect(empty.sort).toBe("newest");
    expect(empty.page).toBe(1);
  });

  it("accepts both repeated and comma-joined values", () => {
    expect(parseFilters({ tag: ["a", "b"] }).tags).toEqual(["a", "b"]);
    expect(parseFilters({ tag: "a,b" }).tags).toEqual(["a", "b"]);
  });

  it("drops unknown categories and out-of-range credibility", () => {
    expect(parseFilters({ cat: "model-launch,nonsense" }).categories).toEqual([
      "model-launch",
    ]);
    expect(parseFilters({ cred: "9" }).minCredibility).toBe(1);
    expect(parseFilters({ cred: "0" }).minCredibility).toBe(1);
  });

  it("ignores an unknown sort", () => {
    expect(parseFilters({ sort: "sideways" }).sort).toBe("newest");
  });
});

describe("buildQuery toggling", () => {
  it("adds a facet that isn't active", () => {
    expect(buildQuery(empty, { tag: "agents" })).toBe("?tag=agents");
  });

  it("removes a facet that is already active", () => {
    const active = parseFilters({ tag: "agents" });
    expect(buildQuery(active, { tag: "agents" })).toBe(FEED_PATH);
  });

  it("never returns an empty href", () => {
    // An empty href resolves to the *current* URL, so toggling off the last
    // filter would silently re-request the filtered page and look like a
    // no-op. Every result must be a real destination.
    const active = parseFilters({ tag: "agents" });
    for (const href of [
      buildQuery(active, { tag: "agents" }),
      buildQuery(active, { clear: true }),
      buildQuery(empty, {}),
    ]) {
      expect(href).not.toBe("");
      expect(href.startsWith("/") || href.startsWith("?")).toBe(true);
    }
  });

  it("leaves other facets in place when toggling one off", () => {
    const active = parseFilters({ tag: "agents,coding", org: "openai" });
    const href = buildQuery(active, { tag: "agents" });
    expect(href).toContain("tag=coding");
    expect(href).toContain("org=openai");
    expect(href).not.toContain("agents");
  });

  it("toggles orgs, categories and sources the same way", () => {
    expect(buildQuery(parseFilters({ org: "openai" }), { org: "openai" })).toBe(
      FEED_PATH,
    );
    expect(
      buildQuery(parseFilters({ cat: "deal" }), { cat: "deal" }),
    ).toBe(FEED_PATH);
    expect(buildQuery(parseFilters({ src: "verge-ai" }), { src: "verge-ai" })).toBe(
      FEED_PATH,
    );
  });

  it("resets pagination when a facet changes", () => {
    const onPage3 = parseFilters({ tag: "agents", page: "3" });
    expect(buildQuery(onPage3, { tag: "coding" })).not.toContain("page");
  });

  it("keeps credibility and sort across a toggle", () => {
    const active = parseFilters({ tag: "agents", cred: "4", sort: "impact" });
    const href = buildQuery(active, { tag: "agents" });
    expect(href).toContain("cred=4");
    expect(href).toContain("sort=impact");
  });

  it("clears everything on clear", () => {
    const active = parseFilters({ tag: "agents", cred: "4", q: "gemini" });
    expect(buildQuery(active, { clear: true })).toBe(FEED_PATH);
  });
});

describe("hasActiveFilters", () => {
  it("is false for a bare feed", () => {
    expect(hasActiveFilters(empty)).toBe(false);
  });

  it("notices each kind of filter", () => {
    expect(hasActiveFilters(parseFilters({ q: "gemini" }))).toBe(true);
    expect(hasActiveFilters(parseFilters({ tag: "agents" }))).toBe(true);
    expect(hasActiveFilters(parseFilters({ cred: "3" }))).toBe(true);
  });

  it("does not count sort or page as filters", () => {
    expect(hasActiveFilters(parseFilters({ sort: "impact", page: "2" }))).toBe(
      false,
    );
  });
});

describe("unread facet", () => {
  it("parses and round-trips", () => {
    expect(parseFilters({ unread: "1" }).unreadOnly).toBe(true);
    expect(parseFilters({}).unreadOnly).toBe(false);
    expect(buildQuery(empty, { unread: true })).toBe("?unread=1");
  });

  it("toggles off to a real href", () => {
    const active = parseFilters({ unread: "1" });
    expect(buildQuery(active, { unread: false })).toBe(FEED_PATH);
  });

  it("composes with other facets", () => {
    const active = parseFilters({ unread: "1", org: "openai", cred: "4" });
    const href = buildQuery(active, { org: "anthropic" });
    expect(href).toContain("unread=1");
    expect(href).toContain("cred=4");

    // URLSearchParams percent-encodes the comma; it decodes back on the way in,
    // so assert on the parsed round-trip rather than the raw string.
    const roundTripped = parseFilters(
      Object.fromEntries(new URLSearchParams(href.replace(/^\?/, ""))),
    );
    expect(roundTripped.orgs).toEqual(["openai", "anthropic"]);
    expect(roundTripped.unreadOnly).toBe(true);
    expect(roundTripped.minCredibility).toBe(4);
  });

  it("counts as an active filter", () => {
    expect(hasActiveFilters(parseFilters({ unread: "1" }))).toBe(true);
  });
});
