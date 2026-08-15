import { signOutAction } from "@/app/actions/auth";
import { currentUser } from "@/lib/auth";

/**
 * Who is signed in, and the way out.
 *
 * An async server component so `SiteHeader` doesn't have to thread the session
 * down from every page that renders it.
 */
export async function AccountMenu() {
  const user = await currentUser();
  if (!user) return null;

  const label = user.name?.trim() || user.email?.split("@")[0] || "Account";

  return (
    <div className="hidden shrink-0 items-center gap-2 sm:flex">
      <span
        className="max-w-[12ch] truncate text-[12px] text-ink-muted"
        title={user.email ?? undefined}
      >
        {label}
        {user.role === "admin" && (
          <span className="ml-1 text-clay" title="Can manage sources">
            ●
          </span>
        )}
      </span>
      <form action={signOutAction}>
        <button
          type="submit"
          className="rounded-md px-2 py-1 text-[12px] text-ink-muted transition-colors hover:text-ink"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
