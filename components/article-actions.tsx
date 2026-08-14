"use client";

import { Star } from "lucide-react";
import { useOptimistic, useTransition } from "react";
import { markRead, toggleSaved } from "@/app/actions/reading";
import { cn } from "@/lib/utils";

/**
 * The outbound link, which records the read as a side effect.
 *
 * The action is deliberately *not* awaited: the browser is already opening the
 * publisher in a new tab, and read state must never sit between the click and
 * the article. A failure here loses a read mark, which is recoverable; a
 * blocked click is not.
 */
export function ReadLink({
  articleId,
  href,
  isRead,
  className,
  children,
}: {
  articleId: string;
  href: string;
  isRead: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => {
        if (!isRead) void markRead(articleId);
      }}
      className={className}
    >
      {children}
    </a>
  );
}

/** Star toggle. Flips immediately, then reconciles with the server. */
export function SaveButton({
  articleId,
  isSaved,
}: {
  articleId: string;
  isSaved: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(isSaved);

  return (
    <button
      type="button"
      disabled={pending}
      aria-label={optimistic ? "Remove from saved" : "Save for later"}
      title={optimistic ? "Remove from saved" : "Save for later"}
      onClick={() =>
        startTransition(async () => {
          setOptimistic(!optimistic);
          await toggleSaved(articleId);
        })
      }
      className={cn(
        "rounded-sm p-1 transition-colors",
        optimistic
          ? "text-clay hover:text-clay-deep"
          : "text-ink-faint hover:text-ink-muted",
      )}
    >
      <Star className={cn("h-3.5 w-3.5", optimistic && "fill-current")} />
    </button>
  );
}
