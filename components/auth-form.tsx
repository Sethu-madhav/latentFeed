"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  type AuthFormState,
  signInWithGoogle,
  signInWithPassword,
  signUpWithPassword,
} from "@/app/actions/auth";

const FIELD =
  "mt-1 w-full rounded-md border border-rule bg-paper-raised px-3 py-2 text-[13px] text-ink focus:border-clay focus:outline-none";
const LABEL = "block text-[12px] font-medium text-ink-muted";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-4 w-full rounded-md bg-ink px-3 py-2 text-[13px] font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-50"
    >
      {pending ? "One moment…" : label}
    </button>
  );
}

function GoogleButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex w-full items-center justify-center gap-2 rounded-md border border-rule bg-paper-raised px-3 py-2 text-[13px] font-medium text-ink transition-colors hover:bg-paper disabled:opacity-50"
    >
      <svg viewBox="0 0 18 18" className="h-4 w-4" aria-hidden="true">
        <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z" />
        <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z" />
        <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z" />
        <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z" />
      </svg>
      {pending ? "Redirecting…" : "Continue with Google"}
    </button>
  );
}

export function AuthForm({
  mode,
  next,
  google,
}: {
  mode: "signin" | "signup";
  next: string;
  /** False when no OAuth client is configured; the button is hidden entirely. */
  google: boolean;
}) {
  const signup = mode === "signup";
  const [state, action] = useActionState<AuthFormState, FormData>(
    signup ? signUpWithPassword : signInWithPassword,
    {},
  );

  /*
   * Controlled on purpose. React resets an uncontrolled form when a
   * useActionState submit resolves, so a rejected password would also wipe the
   * email the reader had just typed.
   */
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <div className="w-full max-w-xs">
      <h1 className="font-display text-[20px] tracking-tight text-ink">
        latent<span className="text-clay">Feed</span>
      </h1>
      <p className="mt-1 text-[13px] text-ink-muted">
        {signup ? "Create an account to start reading." : "Sign in to continue."}
      </p>

      {google && (
        <>
          <form action={signInWithGoogle} className="mt-5">
            <input type="hidden" name="next" value={next} />
            <GoogleButton />
          </form>

          <div className="my-4 flex items-center gap-3">
            <span className="h-px flex-1 bg-rule" />
            <span className="text-[11px] uppercase tracking-wide text-ink-muted">
              or
            </span>
            <span className="h-px flex-1 bg-rule" />
          </div>
        </>
      )}

      <form action={action} className={google ? undefined : "mt-5"}>
        <input type="hidden" name="next" value={next} />

        {signup && (
          <div className="mb-3">
            <label className={LABEL} htmlFor="name">
              Name <span className="font-normal">(optional)</span>
            </label>
            <input
              id="name"
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              className={FIELD}
            />
          </div>
        )}

        <div className="mb-3">
          <label className={LABEL} htmlFor="email">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            className={FIELD}
          />
        </div>

        <div>
          <label className={LABEL} htmlFor="password">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={signup ? "new-password" : "current-password"}
            className={FIELD}
          />
          {signup && (
            <p className="mt-1 text-[11px] text-ink-muted">
              At least 10 characters, with a letter and a number.
            </p>
          )}
        </div>

        {state.error && (
          <p role="alert" className="mt-3 text-[12px] text-clay-deep">
            {state.error}
          </p>
        )}

        <Submit label={signup ? "Create account" : "Sign in"} />
      </form>

      <p className="mt-4 text-center text-[12px] text-ink-muted">
        {signup ? "Already have an account? " : "No account yet? "}
        <Link
          href={`${signup ? "/login" : "/signup"}?next=${encodeURIComponent(next)}`}
          className="text-clay hover:underline"
        >
          {signup ? "Sign in" : "Sign up"}
        </Link>
      </p>
    </div>
  );
}
