import type { ArticleCategory } from "@/db/schema";
import { CATEGORY_ORDER } from "@/lib/enrich/classify";

/**
 * Feed state lives entirely in the URL, so every view is shareable and
 * bookmarkable and the server component can read it without client state.
 */
export interface FeedFilters {
  q?: string;
  categories: ArticleCategory[];
  orgs: string[];
  tags: string[];
  sources: string[];
  /** Minimum credibility, 1–5. */
  minCredibility: number;
  /** Hide anything already read. */
  unreadOnly: boolean;
  from?: Date;
  to?: Date;
  sort: SortMode;
  page: number;
}

export type SortMode = "newest" | "credibility" | "impact";
export const SORT_MODES: SortMode[] = ["newest", "credibility", "impact"];

export const PAGE_SIZE = 60;

/** Where an unfiltered feed lives. Used when a query string would be empty. */
export const FEED_PATH = "/";

const VALID_CATEGORIES = new Set<string>(CATEGORY_ORDER);

/** Query values arrive as string | string[] | undefined from Next.js. */
type Param = string | string[] | undefined;

function first(value: Param): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Accepts both `?cat=a&cat=b` and `?cat=a,b`. */
function list(value: Param): string[] {
  const raw = Array.isArray(value) ? value : value ? [value] : [];
  return raw
    .flatMap((v) => v.split(","))
    .map((v) => v.trim())
    .filter(Boolean);
}

function date(value: Param): Date | undefined {
  const raw = first(value);
  if (!raw) return undefined;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export function parseFilters(
  params: Record<string, Param>,
): FeedFilters {
  const sortRaw = first(params.sort) as SortMode | undefined;
  const credRaw = Number(first(params.cred));
  const pageRaw = Number(first(params.page));

  return {
    q: first(params.q)?.trim() || undefined,
    categories: list(params.cat).filter((c) =>
      VALID_CATEGORIES.has(c),
    ) as ArticleCategory[],
    orgs: list(params.org),
    tags: list(params.tag),
    sources: list(params.src),
    minCredibility:
      Number.isFinite(credRaw) && credRaw >= 1 && credRaw <= 5
        ? Math.floor(credRaw)
        : 1,
    unreadOnly: first(params.unread) === "1",
    from: date(params.from),
    to: date(params.to),
    sort: sortRaw && SORT_MODES.includes(sortRaw) ? sortRaw : "newest",
    page: Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1,
  };
}

/** True when anything is narrowing the feed (drives the "clear" affordance). */
export function hasActiveFilters(f: FeedFilters): boolean {
  return Boolean(
    f.q ||
      f.categories.length ||
      f.orgs.length ||
      f.tags.length ||
      f.sources.length ||
      f.minCredibility > 1 ||
      f.unreadOnly ||
      f.from ||
      f.to,
  );
}

/**
 * Rebuild the query string with one facet changed. Multi-select facets toggle;
 * any change resets pagination.
 */
export function buildQuery(
  current: FeedFilters,
  change: Partial<{
    q: string | undefined;
    cat: string;
    org: string;
    tag: string;
    src: string;
    cred: number;
    sort: SortMode;
    page: number;
    unread: boolean;
    from: string | undefined;
    to: string | undefined;
    clear: true;
  }>,
): string {
  if (change.clear) return FEED_PATH;

  const params = new URLSearchParams();

  const q = "q" in change ? change.q : current.q;
  if (q) params.set("q", q);

  const toggle = (values: string[], value?: string): string[] =>
    value === undefined
      ? values
      : values.includes(value)
        ? values.filter((v) => v !== value)
        : [...values, value];

  const categories = toggle(current.categories, change.cat);
  const orgs = toggle(current.orgs, change.org);
  const tags = toggle(current.tags, change.tag);
  const srcs = toggle(current.sources, change.src);

  if (categories.length) params.set("cat", categories.join(","));
  if (orgs.length) params.set("org", orgs.join(","));
  if (tags.length) params.set("tag", tags.join(","));
  if (srcs.length) params.set("src", srcs.join(","));

  const cred = change.cred ?? current.minCredibility;
  if (cred > 1) params.set("cred", String(cred));

  const unread = "unread" in change ? change.unread : current.unreadOnly;
  if (unread) params.set("unread", "1");

  const from = "from" in change ? change.from : current.from?.toISOString().slice(0, 10);
  const to = "to" in change ? change.to : current.to?.toISOString().slice(0, 10);
  if (from) params.set("from", from);
  if (to) params.set("to", to);

  const sort = change.sort ?? current.sort;
  if (sort !== "newest") params.set("sort", sort);

  // Changing a facet invalidates the current page.
  const page = change.page ?? 1;
  if (page > 1) params.set("page", String(page));

  const qs = params.toString();
  // Must be the path, not "": an empty href resolves to the *current* URL, so
  // toggling off the last active filter would re-request the filtered page and
  // look like the click did nothing.
  return qs ? `?${qs}` : FEED_PATH;
}
