import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Compact relative time for a dense feed: "4m", "3h", "2d", then a date. */
export function relativeTime(date: Date, now = new Date()): string {
  const seconds = Math.round((now.getTime() - date.getTime()) / 1000);

  if (seconds < 45) return "now";
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)}h`;
  if (seconds < 604_800) return `${Math.round(seconds / 86_400)}d`;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

/** Trim a summary to a whole word near the limit. */
export function truncate(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > limit * 0.6 ? lastSpace : limit)}…`;
}

/** Display host for an article link. */
export function displayHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
