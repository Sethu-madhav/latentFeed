import { AuthForm } from "@/components/auth-form";
import { googleConfigured } from "@/lib/auth/config";

export const dynamic = "force-dynamic";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next = "/" } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <AuthForm mode="signup" next={next} google={googleConfigured} />
    </div>
  );
}
