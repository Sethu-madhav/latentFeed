"use client";

import { Undo2 } from "lucide-react";
import { useTransition } from "react";
import { restoreSource } from "@/app/sources/actions";
import type { RetiredSource } from "@/lib/data";
import { relativeTime } from "@/lib/utils";

/**
 * Feeds removed from the stock registry.
 *
 * Listed rather than silently absent, so it's obvious why a source you expect
 * isn't in the list — and so seeding skipping it reads as intentional.
 */
export function RetiredSources({ sources }: { sources: RetiredSource[] }) {
  const [pending, startTransition] = useTransition();

  if (sources.length === 0) return null;

  return (
    <section>
      <h2 className="border-b border-rule bg-paper-sunken/90 px-4 py-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-ink-muted sm:px-6">
        Removed
        <span className="ml-2 text-ink-faint">{sources.length}</span>
      </h2>

      <p className="border-b border-rule px-4 py-2 text-[12px] leading-relaxed text-ink-faint sm:px-6">
        These stay removed across <code className="font-mono">db:seed</code>.
        Restoring one brings the feed back; it refills on the next poll.
      </p>

      {sources.map((source) => (
        <div
          key={source.slug}
          className="flex items-center gap-3 border-b border-rule px-4 py-2.5 sm:px-6"
        >
          <div className="min-w-0 flex-1">
            <span className="text-[13px] text-ink-muted">
              {source.name ?? source.slug}
            </span>
            <span
              className="ml-2 font-mono text-[10.5px] text-ink-faint"
              suppressHydrationWarning
            >
              removed {relativeTime(source.retiredAt)} ago
            </span>
          </div>

          {source.inRegistry ? (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(() => void restoreSource(source.slug))
              }
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-rule px-2.5 py-1 text-[12px] text-ink-muted transition-colors hover:bg-paper-sunken hover:text-ink disabled:opacity-40"
            >
              <Undo2 className="h-3.5 w-3.5" />
              Restore
            </button>
          ) : (
            <span className="shrink-0 font-mono text-[10px] text-ink-faint">
              not in registry
            </span>
          )}
        </div>
      ))}
    </section>
  );
}
