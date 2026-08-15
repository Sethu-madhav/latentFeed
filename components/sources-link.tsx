import { isAdminNow } from "@/lib/auth";

/**
 * The Sources nav entry, rendered only for admins.
 *
 * /sources redirects non-admins on its own, so this is about not advertising a
 * page a reader cannot use. An async server component so the three headers
 * that show this link don't each have to resolve the role themselves.
 */
export async function SourcesLink({ className }: { className?: string }) {
  if (!(await isAdminNow())) return null;

  return (
    <a href="/sources" className={className}>
      Sources
    </a>
  );
}
