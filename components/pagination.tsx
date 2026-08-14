import { ChevronLeft, ChevronRight } from "lucide-react";
import { buildQuery, PAGE_SIZE, type FeedFilters } from "@/lib/filters";

export function Pagination({
  filters,
  total,
}: {
  filters: FeedFilters;
  total: number;
}) {
  const pages = Math.ceil(total / PAGE_SIZE);
  if (pages <= 1) return null;

  const first = (filters.page - 1) * PAGE_SIZE + 1;
  const last = Math.min(filters.page * PAGE_SIZE, total);

  return (
    <div className="flex items-center justify-between gap-4 px-4 py-5 text-[12px] text-ink-muted sm:px-6">
      <span className="font-mono text-[11px] tabular-nums">
        {first.toLocaleString()}–{last.toLocaleString()} of{" "}
        {total.toLocaleString()}
      </span>

      <div className="flex items-center gap-2">
        {filters.page > 1 && (
          <a
            href={buildQuery(filters, { page: filters.page - 1 })}
            className="inline-flex items-center gap-1 rounded-md border border-rule px-2.5 py-1 transition-colors hover:bg-paper-sunken hover:text-ink"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Newer
          </a>
        )}
        <span className="font-mono text-[11px] tabular-nums text-ink-faint">
          {filters.page} / {pages}
        </span>
        {filters.page < pages && (
          <a
            href={buildQuery(filters, { page: filters.page + 1 })}
            className="inline-flex items-center gap-1 rounded-md border border-rule px-2.5 py-1 transition-colors hover:bg-paper-sunken hover:text-ink"
          >
            Older
            <ChevronRight className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
    </div>
  );
}
