"use server";

import { eq } from "drizzle-orm";
import { AuthError } from "next-auth";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { signIn, signOut } from "@/lib/auth";
import {
  hashPassword,
  normalizeEmail,
  passwordProblem,
} from "@/lib/auth/password";

export type AuthFormState = { error?: string };

/** Only ever return to a path on this app, never an absolute URL. */
function safeNext(value: unknown): string {
  const next = String(value ?? "/");
  return next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function signInWithGoogle(formData: FormData): Promise<void> {
  await signIn("google", { redirectTo: safeNext(formData.get("next")) });
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}

export async function signInWithPassword(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };

  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: safeNext(formData.get("next")),
    });
  } catch (error) {
    /*
     * A successful sign-in also throws — `redirect()` signals itself with an
     * exception. Only AuthError means the credentials were rejected; anything
     * else has to be rethrown or the redirect never happens and the form
     * appears to do nothing.
     */
    if (error instanceof AuthError) {
      return { error: "That email and password didn't match." };
    }
    throw error;
  }
  return {};
}

export async function signUpWithPassword(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const name = String(formData.get("name") ?? "").trim();
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const password = String(formData.get("password") ?? "");

  if (!looksLikeEmail(email)) return { error: "Enter a valid email address." };
  const weak = passwordProblem(password);
  if (weak) return { error: weak };

  const [existing] = await db
    .select({ id: users.id, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing) {
    /*
     * An account with no password hash was created through Google. Setting a
     * password on it here would hand the account to anyone who knows the
     * address, so the only way in stays the provider that proved ownership.
     */
    return existing.passwordHash
      ? { error: "That email already has an account. Sign in instead." }
      : { error: "That email signed up with Google. Use the Google button." };
  }

  await db.insert(users).values({
    email,
    name: name || null,
    passwordHash: await hashPassword(password),
  });

  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: safeNext(formData.get("next")),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Account created, but sign-in failed. Try signing in." };
    }
    throw error;
  }
  return {};
}
