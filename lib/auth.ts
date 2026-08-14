/**
 * Single shared password.
 *
 * The app has one reader, so there are no accounts — just a signed cookie
 * proving the password was entered. Uses Web Crypto rather than node:crypto
 * so the same code runs in middleware (edge runtime) and in server actions.
 */

export const SESSION_COOKIE = "lf_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 90; // 90 days

function secret(): string {
  return process.env.APP_PASSWORD ?? "";
}

/** True when no password is configured — local dev stays open. */
export function authDisabled(): boolean {
  return secret().length === 0;
}

async function hmac(value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(signature)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** The cookie value proving the password was entered. */
export async function sessionToken(): Promise<string> {
  return hmac("authenticated");
}

/**
 * Constant-time string compare.
 *
 * `===` on a secret leaks its length and prefix through timing; this always
 * walks the whole string.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function isValidSession(token: string | undefined): Promise<boolean> {
  if (authDisabled()) return true;
  if (!token) return false;
  return timingSafeEqual(token, await sessionToken());
}

export async function isValidPassword(candidate: string): Promise<boolean> {
  if (authDisabled()) return true;
  return timingSafeEqual(candidate, secret());
}
