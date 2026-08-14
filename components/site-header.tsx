import { Suspense } from "react";
import type { FeedStats } from "@/lib/data";
import { buildQuery, SORT_MODES, type FeedFilters } from "@/lib/filters";
import { cn, relativeTime, timeAgo } from "@/lib/utils";
import { ReaderControls } from "./reader-controls";
import { SearchBox } from "./search-box";
import { ThemeToggle } from "./theme-toggle";

const SORT_LABELS: Record<string, string> = {
  newest: "Newest",
  credibility: "Credibility",
  impact: "Impact",
};

export function SiteHeader({
  filters,
  stats,
  reader,
}: {
  filters: FeedFilters;
  stats: FeedStats;
  reader: { newSinceLastVisit: number; unread: number; saved: number };
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-rule bg-paper/85 backdrop-blur-md">
      <div className="flex items-center gap-4 px-4 py-2.5 sm:px-6">
        <a href="/" className="flex shrink-0 items-baseline gap-1.5">
          <span className="font-display text-[17px] tracking-tight text-ink">
            latent<span className="text-clay">Feed</span>
          </span>
        </a>

        <a
          href="/radar"
          className="hidden shrink-0 rounded-md px-2 py-1 text-[12.5px] text-ink-muted transition-colors hover:text-ink sm:block"
        >
          Radar
        </a>

        <a
          href="/digest"
          className="hidden shrink-0 rounded-md px-2 py-1 text-[12.5px] text-ink-muted transition-colors hover:text-ink sm:block"
        >
          Brief
        </a>

        <a
          href="/saved"
          className="hidden shrink-0 rounded-md px-2 py-1 text-[12.5px] text-ink-muted transition-colors hover:text-ink sm:block"
        >
          Saved{reader.saved > 0 ? ` ${reader.saved}` : ""}
        </a>

        <a
          href="/releases"
          className="hidden shrink-0 rounded-md px-2 py-1 text-[12.5px] text-ink-muted transition-colors hover:text-ink sm:block"
        >
          Releases
        </a>

        <a
          href="/sources"
          className="hidden shrink-0 rounded-md px-2 py-1 text-[12.5px] text-ink-muted transition-colors hover:text-ink sm:block"
        >
          Sources
        </a>

        <Suspense fallback={<div className="flex-1" />}>
          <SearchBox initial={filters.q} />
        </Suspense>

        <div className="hidden items-center gap-1 md:flex">
          {SORT_MODES.map((mode) => (
            <a
              key={mode}
              href={buildQuery(filters, { sort: mode })}
              className={cn(
                "rounded-md px-2 py-1 text-[12px] transition-colors",
                filters.sort === mode
                  ? "bg-paper-sunken font-medium text-ink"
                  : "text-ink-muted hover:text-ink",
              )}
            >
              {SORT_LABELS[mode]}
            </a>
          ))}
        </div>

        <ThemeToggle />
      </div>

      <div className="flex items-center gap-4 overflow-x-auto border-t border-rule/60 px-4 py-1.5 font-mono text-[10.5px] text-ink-faint sm:px-6">
        <ReaderControls
          newSinceLastVisit={reader.newSinceLastVisit}
          unread={reader.unread}
        />
        <a
          href={buildQuery(filters, { unread: !filters.unreadOnly })}
          className={
            filters.unreadOnly
              ? "font-medium text-clay-deep"
              : "transition-colors hover:text-ink"
          }
          title={filters.unreadOnly ? "Show everything" : "Show only unread"}
        >
          {filters.unreadOnly ? "unread only" : "all"}
        </a>
        <span className="tabular-nums">{stats.total.toLocaleString()} articles</span>
        <span className="tabular-nums">{stats.last24h} in 24h</span>
        <span className="tabular-nums">{stats.rumours} unverified</span>
        <span className="tabular-nums">{stats.activeSources} sources</span>
        {stats.failingSources > 0 && (
          <span className="text-clay-deep" title="Sources with recent fetch failures">
            {stats.failingSources} failing
          </span>
        )}
        {stats.lastIngestAt && (
          <span className="ml-auto shrink-0" title={stats.lastIngestAt.toLocaleString()}>
            updated {timeAgo(stats.lastIngestAt)}
          </span>
        )}
      </div>
    </header>
  );
}
