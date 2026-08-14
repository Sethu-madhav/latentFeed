import { Layers } from "lucide-react";
import type { FeedArticle } from "@/lib/data";
import { CATEGORY_META } from "@/lib/enrich/classify";
import { ORG_BY_SLUG } from "@/lib/orgs";
import { buildQuery, type FeedFilters } from "@/lib/filters";
import { cn, displayHost, relativeTime, truncate } from "@/lib/utils";
import { CredibilityMeter, credibilityLabel } from "./credibility-meter";

/**
 * One article as a grid card.
 *
 * News feeds like this have no thumbnails, so the cover strip stands in for
 * one: a wash of the lead company's accent colour, which gives the grid enough
 * visual rhythm to scan by company without inventing imagery. Cards are equal
 * height with the metadata pinned to the bottom, so the credibility meters
 * line up across a row and can be compared at a glance.
 */
export function ArticleCard({
  article,
  filters,
}: {
  article: FeedArticle;
  filters: FeedFilters;
}) {
  const category = CATEGORY_META[article.category];
  const host = article.publisherDomain ?? displayHost(article.url);
  const leadOrg = article.orgSlugs
    .map((slug) => ORG_BY_SLUG.get(slug))
    .find(Boolean);

  const accent = leadOrg?.accent ?? category.accent;

  return (
    <article
      className={cn(
        "group flex h-full flex-col overflow-hidden rounded-lg border bg-paper-raised transition-all",
        "hover:-translate-y-px hover:shadow-[0_2px_12px_rgba(0,0,0,0.06)]",
        article.isRumour
          ? "border-clay/40 bg-clay-wash/30"
          : "border-rule hover:border-rule-strong",
      )}
    >
      {/*
        Cover strip — the thumbnail's stand-in. Kept short: unlike a YouTube
        thumbnail this carries no information, so a tall band would just be
        decoration pushing the headline down.
      */}
      <div
        className="relative flex h-9 items-center px-3"
        style={{
          background: `linear-gradient(135deg, ${accent}30 0%, ${accent}0d 55%, transparent 100%)`,
        }}
      >
        <span
          aria-hidden
          className="absolute left-0 top-0 h-full w-[3px]"
          style={{ backgroundColor: accent }}
        />

        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span
            className="font-mono text-[10px] font-medium tracking-[0.08em]"
            style={{ color: category.accent }}
          >
            {category.short}
          </span>
          {article.isRumour && (
            <span className="rounded-sm bg-clay/20 px-1.5 py-px font-mono text-[9px] font-semibold tracking-[0.1em] text-clay-deep">
              UNVERIFIED
            </span>
          )}
        </div>

        <time
          dateTime={article.publishedAt.toISOString()}
          title={article.publishedAt.toLocaleString()}
          className="ml-auto shrink-0 font-mono text-[10.5px] tabular-nums text-ink-faint"
        >
          {relativeTime(article.publishedAt)}
        </time>
      </div>

      <div className="flex min-w-0 flex-1 flex-col px-3 pb-3 pt-2.5">
        <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          {article.orgSlugs.slice(0, 2).map((slug) => {
            const org = ORG_BY_SLUG.get(slug);
            if (!org) return null;
            return (
              <a
                key={slug}
                href={buildQuery(filters, { org: slug })}
                className="inline-flex items-center gap-1 text-[11px] text-ink-muted transition-colors hover:text-ink"
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: org.accent }}
                />
                {org.name}
              </a>
            );
          })}
        </div>

        <h2 className="font-display text-[14.5px] leading-snug text-ink">
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="line-clamp-3 decoration-clay/50 underline-offset-[3px] hover:underline"
          >
            {article.title}
          </a>
        </h2>

        {article.summary && (
          <p className="mt-1.5 line-clamp-2 text-[12px] leading-relaxed text-ink-muted">
            {truncate(article.summary, 180)}
          </p>
        )}

        {article.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {article.tags.slice(0, 3).map((tag) => (
              <a
                key={tag}
                href={buildQuery(filters, { tag })}
                className="rounded-sm bg-paper-sunken px-1.5 py-px font-mono text-[10px] text-ink-muted transition-colors hover:text-ink"
              >
                {tag}
              </a>
            ))}
          </div>
        )}

        {/* Pinned to the bottom so meters align across a row. */}
        <div className="mt-auto pt-3">
          <div className="flex items-center gap-2 border-t border-rule pt-2">
            <CredibilityMeter
              score={article.credibility}
              reasons={article.credibilityReason}
              enrichedBy={article.enrichedBy}
            />
            <span className="font-mono text-[9px] uppercase tracking-wider text-ink-faint">
              {credibilityLabel(article.credibility)}
            </span>

            {article.storyId && (article.storySourceCount ?? 0) > 1 && (
              <a
                href={`/story/${article.storyId}`}
                className="ml-auto inline-flex shrink-0 items-center gap-1 font-mono text-[10px] text-clay-deep transition-colors hover:text-clay"
                title="See every outlet covering this story"
              >
                <Layers className="h-3 w-3" />
                {article.storySourceCount}
              </a>
            )}
          </div>

          <div className="mt-1.5 flex items-baseline gap-2 text-[11px]">
            <a
              href={buildQuery(filters, { src: article.sourceSlug })}
              className="min-w-0 truncate text-ink-muted transition-colors hover:text-ink"
              title={`Filter to ${article.sourceName}`}
            >
              {article.sourceName}
            </a>
            {host && (
              <span className="min-w-0 shrink truncate font-mono text-[10px] text-ink-faint">
                {host}
              </span>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
