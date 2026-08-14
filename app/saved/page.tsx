import { Star } from "lucide-react";
import { ArticleCard } from "@/components/article-card";
import { ThemeToggle } from "@/components/theme-toggle";
import { getSaved } from "@/lib/data";
import { parseFilters } from "@/lib/filters";

export const dynamic = "force-dynamic";

export default async function SavedPage() {
  const saved = await getSaved();
  // The card takes filters to build its facet links; on this page nothing is
  // filtered, so a bare set sends those links back to an unfiltered feed.
  const filters = parseFilters({});

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-rule bg-paper/85 backdrop-blur-md">
        <div className="flex items-center gap-4 px-4 py-2.5 sm:px-6">
          <a href="/" className="font-display text-[17px] tracking-tight text-ink">
            latent<span className="text-clay">Feed</span>
          </a>
          <nav className="flex items-center gap-1 text-[12.5px]">
            <a
              href="/"
              className="rounded-md px-2 py-1 text-ink-muted transition-colors hover:text-ink"
            >
              Feed
            </a>
            <span className="rounded-md bg-paper-sunken px-2 py-1 font-medium text-ink">
              Saved
            </span>
            <a
              href="/radar"
              className="rounded-md px-2 py-1 text-ink-muted transition-colors hover:text-ink"
            >
              Radar
            </a>
            <a
              href="/releases"
              className="rounded-md px-2 py-1 text-ink-muted transition-colors hover:text-ink"
            >
              Releases
            </a>
          </nav>
          <div className="flex-1" />
          <ThemeToggle />
        </div>
      </header>

      <div className="px-4 py-5 sm:px-6">
        <h1 className="flex items-center gap-2 font-display text-[19px] text-ink">
          <Star className="h-4 w-4 text-clay" />
          Saved
        </h1>
        <p className="mt-1 text-[13px] text-ink-muted">
          {saved.length === 0
            ? "Nothing saved yet — tap the star on any card to keep it here."
            : `${saved.length} article${saved.length === 1 ? "" : "s"}, most recently saved first.`}
        </p>

        {saved.length > 0 && (
          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {saved.map((article) => (
              <ArticleCard key={article.id} article={article} filters={filters} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
