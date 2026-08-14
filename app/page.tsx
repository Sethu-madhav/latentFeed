import { ArticleCard } from "@/components/article-card";
import { FilterRail } from "@/components/filter-rail";
import { Pagination } from "@/components/pagination";
import { SiteHeader } from "@/components/site-header";
import { getFacets, getFeed, getReaderCounts, getStats } from "@/lib/data";
import { hasActiveFilters, parseFilters } from "@/lib/filters";
import { cn } from "@/lib/utils";

// Always render fresh: the worker writes on its own schedule, and a cached
// feed showing hours-old news defeats the point of a 30-minute poll.
export const dynamic = "force-dynamic";

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseFilters(await searchParams);

  const [{ items, total }, facets, stats, reader] = await Promise.all([
    getFeed(filters),
    getFacets(),
    getStats(),
    getReaderCounts(),
  ]);

  return (
    <div className="min-h-screen">
      <SiteHeader filters={filters} stats={stats} reader={reader} />

      <div className="grid lg:grid-cols-[236px_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <FilterRail filters={filters} facets={facets} />
        </aside>

        <main>
          {items.length === 0 ? (
            <EmptyState hasFilters={hasActiveFilters(filters)} q={filters.q} />
          ) : (
            <>
              <div
                className={cn(
                  "grid gap-3 px-4 py-4 sm:px-6",
                  // Named breakpoints only: an arbitrary min-[…] variant sorts
                  // before the named ones in the generated CSS, so `xl:` would
                  // win at wide widths and the fourth column never appeared.
                  "grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4",
                )}
              >
                {items.map((article) => (
                  <ArticleCard
                    key={article.id}
                    article={article}
                    filters={filters}
                  />
                ))}
              </div>
              <Pagination filters={filters} total={total} />
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function EmptyState({ hasFilters, q }: { hasFilters: boolean; q?: string }) {
  return (
    <div className="px-6 py-24 text-center">
      <p className="font-display text-[17px] text-ink">
        {q ? `Nothing matches “${q}”` : "Nothing here yet"}
      </p>
      <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-ink-muted">
        {hasFilters ? (
          <>
            Try widening the filters, or{" "}
            <a href="/" className="text-clay-deep underline underline-offset-2">
              clear them all
            </a>
            .
          </>
        ) : (
          <>
            Run <code className="font-mono text-[12px]">npm run ingest:once</code>{" "}
            to pull the first batch of articles.
          </>
        )}
      </p>
    </div>
  );
}
