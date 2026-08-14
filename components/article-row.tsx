import { Users } from "lucide-react";
import type { FeedArticle } from "@/lib/data";
import { CATEGORY_META } from "@/lib/enrich/classify";
import { ORG_BY_SLUG } from "@/lib/orgs";
import { buildQuery, type FeedFilters } from "@/lib/filters";
import { cn, displayHost, relativeTime, truncate } from "@/lib/utils";
import { CredibilityMeter, credibilityLabel } from "./credibility-meter";

/**
 * One article. Rumours (credibility ≤ 2) are visually quarantined with a clay
 * left rule and an UNVERIFIED marker so they can share the feed with confirmed
 * reporting without being mistaken for it.
 */
export function ArticleRow({
  article,
  filters,
}: {
  article: FeedArticle;
  filters: FeedFilters;
}) {
  const category = CATEGORY_META[article.category];
  const host = article.publisherDomain ?? displayHost(article.url);

  return (
    <article
      className={cn(
        "group relative border-b border-rule px-4 py-3.5 transition-colors sm:px-6",
        "hover:bg-paper-raised",
        article.isRumour && "border-l-2 border-l-clay bg-clay-wash/40",
      )}
    >
      <div className="flex items-baseline gap-3">
        <time
          dateTime={article.publishedAt.toISOString()}
          title={article.publishedAt.toLocaleString()}
          className="w-9 shrink-0 font-mono text-[11px] tabular-nums text-ink-faint"
        >
          {relativeTime(article.publishedAt)}
        </time>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span
              className="font-mono text-[10px] font-medium tracking-[0.08em]"
              style={{ color: category.accent }}
            >
              {category.short}
            </span>

            {article.isRumour && (
              <span className="rounded-sm bg-clay/15 px-1.5 py-px font-mono text-[9px] font-semibold tracking-[0.1em] text-clay-deep">
                UNVERIFIED
              </span>
            )}

            {article.orgSlugs.slice(0, 3).map((slug) => {
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

          <h2 className="mt-1 font-display text-[15px] leading-snug text-ink">
            <a
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="decoration-clay/50 underline-offset-[3px] hover:underline"
            >
              {article.title}
            </a>
          </h2>

          {article.summary && (
            <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
              {truncate(article.summary, 240)}
            </p>
          )}

          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-faint">
            <a
              href={buildQuery(filters, { src: article.sourceSlug })}
              className="transition-colors hover:text-ink-muted"
              title={`Filter to ${article.sourceName}`}
            >
              {article.sourceName}
            </a>
            {host && host !== article.sourceName && (
              <span className="font-mono text-[10px]">{host}</span>
            )}

            {article.corroborationCount > 0 && (
              <span
                className="inline-flex items-center gap-1"
                title={`${article.corroborationCount} other source${article.corroborationCount === 1 ? "" : "s"} carrying this story`}
              >
                <Users className="h-3 w-3" />
                {article.corroborationCount}
              </span>
            )}

            {article.tags.slice(0, 4).map((tag) => (
              <a
                key={tag}
                href={buildQuery(filters, { tag })}
                className="rounded-sm bg-paper-sunken px-1.5 py-px font-mono text-[10px] text-ink-muted transition-colors hover:text-ink"
              >
                {tag}
              </a>
            ))}
          </div>
        </div>

        <div
          className="flex shrink-0 flex-col items-end gap-1"
          title={credibilityLabel(article.credibility)}
        >
          <CredibilityMeter
            score={article.credibility}
            reasons={article.credibilityReason}
          />
          <span className="font-mono text-[9px] uppercase tracking-wider text-ink-faint">
            {credibilityLabel(article.credibility)}
          </span>
        </div>
      </div>
    </article>
  );
}
