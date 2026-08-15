import { AuthForm } from "@/components/auth-form";
import { googleConfigured } from "@/lib/auth/config";

export const dynamic = "force-dynamic";

/** Auth.js reports provider failures by redirecting here with ?error=. */
const ERRORS: Record<string, string> = {
  OAuthAccountNotLinked:
    "That email already has an account with a different sign-in method.",
  AccessDenied: "Google declined that sign-in.",
  Configuration:
    "Google sign-in isn't configured on this deployment. Use email and password.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next = "/", error } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-xs">
        {error && (
          <p
            role="alert"
            className="mb-4 rounded-md border border-rule bg-paper-raised px-3 py-2 text-[12px] text-clay-deep"
          >
            {ERRORS[error] ?? "That sign-in didn't work. Try again."}
          </p>
        )}
        <AuthForm mode="signin" next={next} google={googleConfigured} />
      </div>
    </div>
  );
}
