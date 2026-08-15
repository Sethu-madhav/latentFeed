import { describe, expect, it } from "vitest";
import {
  hashPassword,
  normalizeEmail,
  passwordProblem,
  verifyPassword,
} from "@/lib/auth/password";

describe("normalizeEmail", () => {
  it("lowercases and trims", () => {
    expect(normalizeEmail("  Sethu@Example.COM ")).toBe("sethu@example.com");
  });

  it("collapses case variants to one key", () => {
    // Postgres compares text case-sensitively, so without this the same person
    // can end up with two accounts and a confusing unique violation.
    expect(normalizeEmail("A@B.com")).toBe(normalizeEmail("a@b.COM"));
  });
});

describe("passwordProblem", () => {
  it("rejects short passwords", () => {
    expect(passwordProblem("abc1")).toMatch(/10 characters/);
  });

  it("requires a letter and a digit", () => {
    expect(passwordProblem("aaaaaaaaaaaa")).toMatch(/letter and one number/);
    expect(passwordProblem("123456789012")).toMatch(/letter and one number/);
  });

  it("accepts a reasonable password", () => {
    expect(passwordProblem("correct1horse")).toBeNull();
  });
});

describe("verifyPassword", () => {
  it("accepts the right password and rejects the wrong one", async () => {
    const hash = await hashPassword("correct1horse");
    expect(await verifyPassword("correct1horse", hash)).toBe(true);
    expect(await verifyPassword("correct1horsf", hash)).toBe(false);
  });

  it("never authenticates an account with no password", async () => {
    /*
     * Google-only accounts have a null hash. Treating null as "no password
     * required" would let anyone sign in as them by submitting an empty
     * string, so this must be false for every input including "".
     */
    expect(await verifyPassword("", null)).toBe(false);
    expect(await verifyPassword("anything at all", null)).toBe(false);
  });

  it("hashes are salted, so equal passwords differ", async () => {
    const [a, b] = await Promise.all([
      hashPassword("correct1horse"),
      hashPassword("correct1horse"),
    ]);
    expect(a).not.toBe(b);
    expect(await verifyPassword("correct1horse", a)).toBe(true);
    expect(await verifyPassword("correct1horse", b)).toBe(true);
  });
});
