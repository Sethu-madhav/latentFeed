import type { SourceCategory, SourceKind } from "@/db/schema";

export const KIND_LABELS: Record<SourceKind, string> = {
  rss: "RSS",
  github_releases: "GitHub releases",
  google_news: "Google News",
  arxiv: "arXiv",
  hf_papers: "HF papers",
  hf_models: "HF models",
  hn: "Hacker News",
  reddit: "Reddit",
};

export const CATEGORY_LABELS: Record<SourceCategory, string> = {
  first_party: "First-party",
  press: "Press",
  analyst: "Analysts",
  research: "Research",
  tooling: "Tooling",
  community: "Community",
  leaks: "Leaks",
  aggregator: "Aggregators",
};

/** Display order for the grouped source list — most authoritative first. */
export const CATEGORY_ORDER: SourceCategory[] = [
  "first_party",
  "press",
  "analyst",
  "research",
  "tooling",
  "aggregator",
  "community",
  "leaks",
];

export const SOURCE_KINDS = Object.keys(KIND_LABELS) as SourceKind[];
export const SOURCE_CATEGORIES = CATEGORY_ORDER;
