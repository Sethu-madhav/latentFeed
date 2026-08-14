"use client";

import { CheckCheck } from "lucide-react";
import { useState, useTransition } from "react";
import { markAllRead, touchLastSeen } from "@/app/actions/reading";

/**
 * "N new" and the mark-all-read sweep.
 *
 * Dismissing the count moves the watermark explicitly rather than on render —
 * a page load that reset it silently would make the count permanently zero.
 */
export function ReaderControls({
  newSinceLastVisit,
  unread,
}: {
  newSinceLastVisit: number;
  unread: number;
}) {
  const [pending, startTransition] = useTransition();
  // Marking all read sweeps every article at once and there is no undo, so it
  // takes two clicks. One stray click on a header control should not silently
  // erase a thousand rows of reading state.
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      {newSinceLastVisit > 0 && (
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(() => void touchLastSeen())}
          title="Dismiss — marks everything as seen up to now"
          className="tabular-nums text-clay-deep transition-colors hover:text-clay disabled:opacity-50"
        >
          {newSinceLastVisit.toLocaleString()} new
        </button>
      )}

      {unread > 0 &&
        (confirming ? (
          <span className="inline-flex items-center gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await markAllRead();
                  setConfirming(false);
                })
              }
              className="font-medium text-clay-deep transition-colors hover:text-clay disabled:opacity-50"
            >
              mark {unread.toLocaleString()} read?
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="transition-colors hover:text-ink"
            >
              cancel
            </button>
          </span>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={() => setConfirming(true)}
            title="Mark every article as read"
            className="inline-flex items-center gap-1 transition-colors hover:text-ink disabled:opacity-50"
          >
            <CheckCheck className="h-3 w-3" />
            {unread.toLocaleString()} unread
          </button>
        ))}
    </>
  );
}
