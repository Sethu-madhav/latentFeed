"use client";

import { Search, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Search field. Submitting navigates rather than fetching, so results are a
 * normal server render and the query stays in the URL like every other filter.
 */
export function SearchBox({ initial }: { initial?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [value, setValue] = useState(initial ?? "");

  // Keep in step when the query changes from elsewhere (back button, a clear).
  useEffect(() => {
    setValue(initial ?? "");
  }, [initial]);

  function submit(next: string) {
    const query = new URLSearchParams(params.toString());
    if (next.trim()) query.set("q", next.trim());
    else query.delete("q");
    // A new search invalidates the current page offset.
    query.delete("page");
    const qs = query.toString();
    router.push(qs ? `/?${qs}` : "/");
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit(value);
      }}
      className="relative flex-1"
      role="search"
    >
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
      <input
        type="search"
        name="q"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search headlines and summaries…"
        aria-label="Search articles"
        className="w-full rounded-md border border-rule bg-paper-raised py-1.5 pl-8 pr-8 text-[13px] text-ink placeholder:text-ink-faint focus:border-clay focus:outline-none"
      />
      {value && (
        <button
          type="button"
          onClick={() => {
            setValue("");
            submit("");
          }}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-faint transition-colors hover:text-ink"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </form>
  );
}
