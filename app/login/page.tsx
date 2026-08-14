import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  isValidPassword,
  sessionToken,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next = "/", error } = await searchParams;

  async function signIn(formData: FormData) {
    "use server";

    const password = String(formData.get("password") ?? "");
    const target = String(formData.get("next") ?? "/");

    if (!(await isValidPassword(password))) {
      redirect(`/login?error=1&next=${encodeURIComponent(target)}`);
    }

    const jar = await cookies();
    jar.set(SESSION_COOKIE, await sessionToken(), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_MAX_AGE,
    });

    // Only ever return to a path on this app, never an absolute URL.
    redirect(target.startsWith("/") ? target : "/");
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form action={signIn} className="w-full max-w-xs">
        <h1 className="font-display text-[20px] tracking-tight text-ink">
          latent<span className="text-clay">Feed</span>
        </h1>
        <p className="mt-1 text-[13px] text-ink-muted">
          Enter the password to continue.
        </p>

        <input type="hidden" name="next" value={next} />
        <input
          type="password"
          name="password"
          autoFocus
          autoComplete="current-password"
          aria-label="Password"
          className="mt-4 w-full rounded-md border border-rule bg-paper-raised px-3 py-2 text-[13px] text-ink focus:border-clay focus:outline-none"
        />

        {error && (
          <p className="mt-2 text-[12px] text-clay-deep">
            That password didn&apos;t work.
          </p>
        )}

        <button
          type="submit"
          className="mt-3 w-full rounded-md bg-ink px-3 py-2 text-[13px] font-medium text-paper transition-opacity hover:opacity-90"
        >
          Sign in
        </button>
      </form>
    </div>
  );
}
