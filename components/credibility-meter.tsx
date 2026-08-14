import type { CredibilityReason } from "@/db/schema";
import { cn } from "@/lib/utils";

const LABELS: Record<number, string> = {
  1: "Rumour",
  2: "Unverified",
  3: "Reported",
  4: "Well sourced",
  5: "Confirmed",
};

export function credibilityLabel(score: number): string {
  return LABELS[score] ?? "Unrated";
}

/**
 * Five dots, filled to the article's score.
 *
 * The tooltip lists the rules that produced the number. A score nobody can
 * interrogate is worse than no score at all — especially here, where the whole
 * point is telling a confirmed launch from a datamined guess.
 */
export function CredibilityMeter({
  score,
  reasons,
  enrichedBy,
  className,
}: {
  score: number;
  reasons?: CredibilityReason[];
  enrichedBy?: string;
  className?: string;
}) {
  const tooltip = [
    `${credibilityLabel(score)} — ${score}/5`,
    ...(reasons ?? []).map((r) => {
      const sign = r.delta > 0 ? `+${r.delta}` : r.delta < 0 ? `${r.delta}` : "·";
      return `${sign}  ${r.detail ?? r.rule}`;
    }),
    // Say which pass produced this, so a heuristic guess isn't mistaken for a
    // read of the actual article.
    enrichedBy === "llm" ? "\nassessed by model" : "\nkeyword heuristics only",
  ].join("\n");

  return (
    <span
      className={cn("inline-flex items-center gap-[3px]", className)}
      title={tooltip}
      aria-label={`Credibility ${score} out of 5: ${credibilityLabel(score)}`}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={cn(
            "block h-[6px] w-[6px] rounded-full transition-colors",
            i <= score
              ? score <= 2
                ? "bg-clay"
                : "bg-ink"
              : "bg-rule-strong/60",
          )}
        />
      ))}
    </span>
  );
}
