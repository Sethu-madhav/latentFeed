import type { FeedStats } from "@/lib/data";
import { isAdminNow } from "@/lib/auth";

/**
 * Source-health counters, admin-only.
 *
 * How many feeds are polling, and how many are failing, is operations detail:
 * it is only actionable by someone who can reach /sources and fix it. To a
 * reader "2 failing" is an alarm about something they cannot see or act on,
 * and it invites questions about a page they have no access to.
 *
 * The article counts either side of this stay visible — those describe the
 * feed itself rather than its plumbing.
 */
export async function SourceStats({ stats }: { stats: FeedStats }) {
  if (!(await isAdminNow())) return null;

  return (
    <>
      <span className="tabular-nums">{stats.activeSources} sources</span>
      {stats.failingSources > 0 && (
        <span className="text-clay-deep" title="Sources with recent fetch failures">
          {stats.failingSources} failing
        </span>
      )}
    </>
  );
}
