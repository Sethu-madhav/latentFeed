import { describe, expect, it } from "vitest";
import { canonicalizeUrl } from "@/lib/enrich/dedup";

/**
 * The batched pre-filter is the guard on embedding spend, so the property it
 * relies on is pinned here: two URLs that differ only in tracking parameters
 * must collapse to one canonical key, or the same article gets embedded twice
 * within a single poll.
 *
 * `filterAlreadySeen` itself needs a database, so it is exercised end to end
 * by running `ingest:once` rather than unit-tested with a fake.
 */
describe("pre-filter canonicalisation", () => {
  it("collapses tracking-param variants of one article", () => {
    const a = canonicalizeUrl("https://example.com/post?utm_source=rss&id=7");
    const b = canonicalizeUrl("https://example.com/post?id=7&utm_campaign=x");
    expect(a).toBe(b);
  });

  it("collapses scheme, www and trailing-slash variants", () => {
    expect(canonicalizeUrl("http://www.example.com/post/")).toBe(
      canonicalizeUrl("https://example.com/post"),
    );
  });

  it("keeps genuinely different articles apart", () => {
    expect(canonicalizeUrl("https://example.com/a")).not.toBe(
      canonicalizeUrl("https://example.com/b"),
    );
  });

  it("keeps a meaningful query parameter", () => {
    // Dropping this would merge two distinct articles into one.
    expect(canonicalizeUrl("https://example.com/p?id=1")).not.toBe(
      canonicalizeUrl("https://example.com/p?id=2"),
    );
  });
});
