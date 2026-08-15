import bcrypt from "bcryptjs";

/**
 * Password hashing. Node runtime only — bcrypt cannot run on the edge.
 */

const COST = 12;

/**
 * A valid hash of a value nobody can supply.
 *
 * Comparing against this when an account doesn't exist keeps the failure path
 * the same length as a wrong-password path. Returning early instead would let
 * anyone time the endpoint to learn which email addresses have accounts.
 */
const DUMMY_HASH = "$2b$12$.V2Jgdxdq68tF18shwwT/e/40fgx9tLRKy8H5PJRmSelwfN/6zqwa";

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

/** Constant-ish time even when the account has no password set. */
export async function verifyPassword(
  plain: string,
  hash: string | null,
): Promise<boolean> {
  if (!hash) {
    await bcrypt.compare(plain, DUMMY_HASH);
    return false;
  }
  return bcrypt.compare(plain, hash);
}

/** Minimum viable strength rule. Returns an error message, or null if fine. */
export function passwordProblem(plain: string): string | null {
  if (plain.length < 10) return "Use at least 10 characters.";
  if (!/[a-zA-Z]/.test(plain) || !/[0-9]/.test(plain)) {
    return "Use at least one letter and one number.";
  }
  return null;
}

/**
 * Postgres compares text case-sensitively, so every read and write of an email
 * goes through this. Without it `Sethu@…` and `sethu@…` are two accounts.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
