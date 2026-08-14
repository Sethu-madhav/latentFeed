import { X } from "lucide-react";
import type { FacetCount } from "@/lib/data";
import { CATEGORY_META } from "@/lib/enrich/classify";
import { buildQuery, hasActiveFilters, type FeedFilters } from "@/lib/filters";
import type { ArticleCategory } from "@/db/schema";
import { credibilityLabel } from "./credibility-meter";
import { cn } from "@/lib/utils";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-rule px-5 py-4 last:border-b-0">
      <h3 className="mb-2.5 font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-ink-faint">
        {title}
      </h3>
      {children}
    </div>
  );
}

function FacetLink({
  href,
  active,
  label,
  count,
  accent,
}: {
  href: string;
  active: boolean;
  label: string;
  count: number;
  accent?: string;
}) {
  return (
    <a
      href={href}
      className={cn(
        "group flex items-center justify-between gap-2 rounded-sm px-1.5 py-[3px] text-[12.5px] transition-colors",
        active
          ? "bg-clay-wash font-medium text-clay-deep"
          : "text-ink-muted hover:bg-paper-sunken hover:text-ink",
      )}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        {accent && (
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: accent }}
          />
        )}
        <span className="truncate">{label}</span>
      </span>
      <span className="shrink-0 font-mono text-[10px] tabular-nums text-ink-faint">
        {count}
      </span>
    </a>
  );
}

/**
 * All filter state is expressed as links, not client state: every facet is a
 * plain anchor to a new query string, so the rail works without JavaScript and
 * any view can be copied out of the URL bar.
 */
export function FilterRail({
  filters,
  facets,
}: {
  filters: FeedFilters;
  facets: {
    categories: FacetCount[];
    orgs: FacetCount[];
    tags: FacetCount[];
    sources: FacetCount[];
  };
}) {
  const categories = facets.categories
    .filter((c) => c.count > 0)
    .sort(
      (a, b) =>
        CATEGORY_META[a.value as ArticleCategory].order -
        CATEGORY_META[b.value as ArticleCategory].order,
    );

  return (
    <nav className="scroll-slim divide-y divide-rule border-r border-rule lg:sticky lg:top-[57px] lg:max-h-[calc(100vh-57px)] lg:overflow-y-auto">
      {hasActiveFilters(filters) && (
        <div className="px-5 py-3">
          <a
            href="/"
            className="inline-flex items-center gap-1.5 text-[12px] text-clay-deep transition-colors hover:text-clay"
          >
            <X className="h-3.5 w-3.5" />
            Clear all filters
          </a>
        </div>
      )}

      <Section title="Credibility">
        <div className="flex flex-col gap-0.5">
          {[1, 2, 3, 4, 5].map((level) => (
            <a
              key={level}
              href={buildQuery(filters, { cred: level })}
              className={cn(
                "flex items-center justify-between rounded-sm px-1.5 py-[3px] text-[12.5px] transition-colors",
                filters.minCredibility === level
                  ? "bg-clay-wash font-medium text-clay-deep"
                  : "text-ink-muted hover:bg-paper-sunken hover:text-ink",
              )}
            >
              <span>{level === 1 ? "All" : `${level}+`}</span>
              <span className="font-mono text-[10px] text-ink-faint">
                {level === 1 ? "everything" : credibilityLabel(level)}
              </span>
            </a>
          ))}
        </div>
      </Section>

      <Section title="Category">
        <div className="flex flex-col gap-0.5">
          {categories.map((c) => {
            const meta = CATEGORY_META[c.value as ArticleCategory];
            return (
              <FacetLink
                key={c.value}
                href={buildQuery(filters, { cat: c.value })}
                active={filters.categories.includes(c.value as ArticleCategory)}
                label={meta.label}
                count={c.count}
                accent={meta.accent}
              />
            );
          })}
        </div>
      </Section>

      <Section title="Company">
        <div className="flex flex-col gap-0.5">
          {facets.orgs.slice(0, 16).map((o) => (
            <FacetLink
              key={o.value}
              href={buildQuery(filters, { org: o.value })}
              active={filters.orgs.includes(o.value)}
              label={o.label}
              count={o.count}
            />
          ))}
        </div>
      </Section>

      <Section title="Topic">
        <div className="flex flex-wrap gap-1">
          {facets.tags.slice(0, 22).map((t) => (
            <a
              key={t.value}
              href={buildQuery(filters, { tag: t.value })}
              className={cn(
                "rounded-sm px-1.5 py-[3px] font-mono text-[10.5px] transition-colors",
                filters.tags.includes(t.value)
                  ? "bg-clay text-white"
                  : "bg-paper-sunken text-ink-muted hover:text-ink",
              )}
            >
              {t.value}
              <span className="ml-1 text-[9px] opacity-60">{t.count}</span>
            </a>
          ))}
        </div>
      </Section>

      <Section title="Source">
        <div className="flex flex-col gap-0.5">
          {facets.sources.slice(0, 20).map((s) => (
            <FacetLink
              key={s.value}
              href={buildQuery(filters, { src: s.value })}
              active={filters.sources.includes(s.value)}
              label={s.label}
              count={s.count}
            />
          ))}
        </div>
      </Section>
    </nav>
  );
}
