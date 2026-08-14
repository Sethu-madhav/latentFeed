import type { SourceCategory, SourceKind } from "@/db/schema";

/**
 * The stock feed list. `db:seed` upserts these by slug; the worker polls
 * whatever ends up enabled in the sources table.
 *
 * Every URL here was verified live on 2026-08-14. Feeds still rot — a source
 * that fails 5 polls in a row auto-disables with the reason recorded, which is
 * expected behaviour, not a bug.
 *
 * baseCredibility:
 *   5  first-party announcements, official release notes, arXiv papers
 *   4  major press desks and established independent analysts
 *   3  aggregators and general-interest tech press
 *   2  community forums (Reddit, HN)
 *   1  leak trackers and anonymous rumour mills
 */
export interface SourceDef {
  slug: string;
  name: string;
  url?: string;
  feedUrl: string;
  kind: SourceKind;
  category: SourceCategory;
  baseCredibility: 1 | 2 | 3 | 4 | 5;
  /** Set only when a feed covers exactly one company. */
  orgSlug?: string;
  /** Minimum minutes between polls. Slow feeds don't need every 30-min cycle. */
  pollMinutes?: number;
  meta?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// First-party — the labs and vendors announcing their own work.
// ---------------------------------------------------------------------------
const FIRST_PARTY: SourceDef[] = [
  {
    slug: "openai-news",
    name: "OpenAI News",
    url: "https://openai.com/news/",
    feedUrl: "https://openai.com/news/rss.xml",
    kind: "rss",
    category: "first_party",
    baseCredibility: 5,
    orgSlug: "openai",
  },
  {
    slug: "deepmind-blog",
    name: "Google DeepMind Blog",
    url: "https://deepmind.google/discover/blog/",
    feedUrl: "https://deepmind.google/blog/rss.xml",
    kind: "rss",
    category: "first_party",
    baseCredibility: 5,
    orgSlug: "google",
  },
  {
    slug: "google-keyword-ai",
    name: "Google — The Keyword (AI)",
    url: "https://blog.google/innovation-and-ai/technology/ai/",
    // The /technology/ai/ path now 302s here and rss-parser chokes on the
    // interstitial HTML, so point straight at the current location.
    feedUrl: "https://blog.google/innovation-and-ai/technology/ai/rss/",
    kind: "rss",
    category: "first_party",
    baseCredibility: 5,
    orgSlug: "google",
  },
  {
    slug: "google-research",
    name: "Google Research Blog",
    url: "https://research.google/blog/",
    feedUrl: "https://research.google/blog/rss/",
    kind: "rss",
    category: "first_party",
    baseCredibility: 5,
    orgSlug: "google",
    pollMinutes: 120,
  },
  {
    slug: "nvidia-blog",
    name: "NVIDIA Blog",
    url: "https://blogs.nvidia.com/",
    feedUrl: "https://blogs.nvidia.com/feed/",
    kind: "rss",
    category: "first_party",
    baseCredibility: 5,
    orgSlug: "nvidia",
  },
  {
    slug: "nvidia-newsroom",
    name: "NVIDIA Newsroom",
    url: "https://nvidianews.nvidia.com/",
    feedUrl: "https://nvidianews.nvidia.com/releases.xml",
    kind: "rss",
    category: "first_party",
    baseCredibility: 5,
    orgSlug: "nvidia",
  },
  {
    slug: "meta-newsroom",
    name: "Meta Newsroom",
    url: "https://about.fb.com/news/",
    feedUrl: "https://about.fb.com/news/feed/",
    kind: "rss",
    category: "first_party",
    baseCredibility: 5,
    orgSlug: "meta",
  },
  {
    slug: "huggingface-blog",
    name: "Hugging Face Blog",
    url: "https://huggingface.co/blog",
    feedUrl: "https://huggingface.co/blog/feed.xml",
    kind: "rss",
    category: "first_party",
    baseCredibility: 5,
    orgSlug: "huggingface",
  },
  {
    slug: "together-blog",
    name: "Together AI Blog",
    url: "https://www.together.ai/blog",
    feedUrl: "https://www.together.ai/blog/rss.xml",
    kind: "rss",
    category: "first_party",
    baseCredibility: 5,
    pollMinutes: 120,
  },
  {
    slug: "qwen-blog",
    name: "Qwen Blog",
    url: "https://qwenlm.github.io/blog/",
    feedUrl: "https://qwenlm.github.io/blog/index.xml",
    kind: "rss",
    category: "first_party",
    baseCredibility: 5,
    orgSlug: "alibaba",
    // Last post Sep 2025 — kept because launches land here first when they do.
    pollMinutes: 240,
  },
];

// ---------------------------------------------------------------------------
// Model weight drops on Hugging Face.
//
// This is the launch signal for the Chinese labs in particular: none of them
// publish a working blog feed, and GitHub's org timeline atoms now return zero
// entries (verified empty for deepseek-ai, MoonshotAI and zai-org). The weights
// always land on Hugging Face, routinely before any announcement exists.
// ---------------------------------------------------------------------------
function hfModels(author: string): string {
  return `https://huggingface.co/api/models?author=${author}&sort=createdAt&direction=-1&limit=30`;
}

const MODEL_DROPS: SourceDef[] = [
  {
    slug: "hf-deepseek",
    name: "DeepSeek model releases",
    url: "https://huggingface.co/deepseek-ai",
    feedUrl: hfModels("deepseek-ai"),
    kind: "hf_models",
    category: "first_party",
    baseCredibility: 5,
    orgSlug: "deepseek",
    pollMinutes: 60,
    meta: { orgLabel: "DeepSeek" },
  },
  {
    slug: "hf-moonshot",
    name: "Moonshot (Kimi) model releases",
    url: "https://huggingface.co/moonshotai",
    feedUrl: hfModels("moonshotai"),
    kind: "hf_models",
    category: "first_party",
    baseCredibility: 5,
    orgSlug: "moonshot",
    pollMinutes: 60,
    meta: { orgLabel: "Moonshot AI" },
  },
  {
    slug: "hf-zai",
    name: "Z.AI (GLM) model releases",
    url: "https://huggingface.co/zai-org",
    feedUrl: hfModels("zai-org"),
    kind: "hf_models",
    category: "first_party",
    baseCredibility: 5,
    orgSlug: "zai",
    pollMinutes: 60,
    meta: { orgLabel: "Z.AI" },
  },
  {
    slug: "hf-qwen",
    name: "Qwen model releases",
    url: "https://huggingface.co/Qwen",
    feedUrl: hfModels("Qwen"),
    kind: "hf_models",
    category: "first_party",
    baseCredibility: 5,
    orgSlug: "alibaba",
    pollMinutes: 60,
    meta: { orgLabel: "Qwen" },
  },
  {
    slug: "hf-openai",
    name: "OpenAI open-weight releases",
    url: "https://huggingface.co/openai",
    feedUrl: hfModels("openai"),
    kind: "hf_models",
    category: "first_party",
    baseCredibility: 5,
    orgSlug: "openai",
    pollMinutes: 120,
    meta: { orgLabel: "OpenAI" },
  },
  {
    slug: "hf-meta-llama",
    name: "Meta Llama model releases",
    url: "https://huggingface.co/meta-llama",
    feedUrl: hfModels("meta-llama"),
    kind: "hf_models",
    category: "first_party",
    baseCredibility: 5,
    orgSlug: "meta",
    pollMinutes: 120,
    meta: { orgLabel: "Meta" },
  },
  {
    slug: "hf-google",
    name: "Google (Gemma) model releases",
    url: "https://huggingface.co/google",
    feedUrl: hfModels("google"),
    kind: "hf_models",
    category: "first_party",
    baseCredibility: 5,
    orgSlug: "google",
    pollMinutes: 120,
    meta: { orgLabel: "Google" },
  },
  {
    slug: "qwen-releases",
    name: "Qwen on GitHub",
    url: "https://github.com/QwenLM/Qwen3",
    feedUrl: "https://github.com/QwenLM/Qwen3/releases.atom",
    kind: "github_releases",
    category: "first_party",
    baseCredibility: 5,
    orgSlug: "alibaba",
    pollMinutes: 120,
  },
];

// ---------------------------------------------------------------------------
// Google News queries — how labs with no public feed get covered at all.
// Anthropic, xAI, Meta AI, Z.AI, Mistral and Thinking Machines all 404/403 on
// every RSS path they've ever had. Credibility is resolved per item from the
// real publisher domain, not from this source's base.
// ---------------------------------------------------------------------------
function googleNews(query: string, when = "7d"): string {
  const q = encodeURIComponent(`${query} when:${when}`);
  return `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`;
}

const GOOGLE_NEWS: SourceDef[] = [
  {
    slug: "gnews-anthropic",
    name: "Anthropic coverage",
    feedUrl: googleNews("Anthropic OR Claude AI"),
    kind: "google_news",
    category: "aggregator",
    baseCredibility: 3,
    orgSlug: "anthropic",
  },
  {
    slug: "gnews-xai",
    name: "xAI coverage",
    feedUrl: googleNews("xAI OR Grok Musk"),
    kind: "google_news",
    category: "aggregator",
    baseCredibility: 3,
    orgSlug: "xai",
  },
  {
    slug: "gnews-ssi",
    name: "SSI / Ilya Sutskever coverage",
    feedUrl: googleNews('"Safe Superintelligence" OR "Ilya Sutskever"', "30d"),
    kind: "google_news",
    category: "aggregator",
    baseCredibility: 3,
    orgSlug: "ssi",
    pollMinutes: 180,
  },
  {
    slug: "gnews-thinking-machines",
    name: "Thinking Machines coverage",
    feedUrl: googleNews('"Thinking Machines Lab" OR "Mira Murati"', "30d"),
    kind: "google_news",
    category: "aggregator",
    baseCredibility: 3,
    orgSlug: "thinking-machines",
    pollMinutes: 180,
  },
  {
    slug: "gnews-meta-ai",
    name: "Meta AI coverage",
    feedUrl: googleNews('"Meta AI" OR Llama OR "Superintelligence Labs"'),
    kind: "google_news",
    category: "aggregator",
    baseCredibility: 3,
    orgSlug: "meta",
  },
  {
    slug: "gnews-datacenter-deals",
    name: "AI datacenter & compute deals",
    feedUrl: googleNews(
      '(OpenAI OR Anthropic OR Nvidia OR Meta OR xAI) (datacenter OR "data center" OR gigawatt OR "compute deal")',
    ),
    kind: "google_news",
    category: "aggregator",
    baseCredibility: 3,
  },
  {
    slug: "gnews-funding",
    name: "AI funding & acquisitions",
    feedUrl: googleNews(
      '("AI startup" OR "AI lab") (raises OR acquisition OR "funding round" OR valuation)',
    ),
    kind: "google_news",
    category: "aggregator",
    baseCredibility: 3,
  },
];

// ---------------------------------------------------------------------------
// Press.
// ---------------------------------------------------------------------------
const PRESS: SourceDef[] = [
  {
    slug: "techcrunch-ai",
    name: "TechCrunch AI",
    url: "https://techcrunch.com/category/artificial-intelligence/",
    feedUrl: "https://techcrunch.com/category/artificial-intelligence/feed/",
    kind: "rss",
    category: "press",
    baseCredibility: 4,
  },
  {
    slug: "verge-ai",
    name: "The Verge AI",
    url: "https://www.theverge.com/ai-artificial-intelligence",
    feedUrl: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml",
    kind: "rss",
    category: "press",
    baseCredibility: 4,
  },
  {
    slug: "arstechnica-ai",
    name: "Ars Technica AI",
    url: "https://arstechnica.com/ai/",
    feedUrl: "https://arstechnica.com/ai/feed/",
    kind: "rss",
    category: "press",
    baseCredibility: 4,
  },
  {
    slug: "mit-tr-ai",
    name: "MIT Technology Review — AI",
    url: "https://www.technologyreview.com/topic/artificial-intelligence/",
    feedUrl: "https://www.technologyreview.com/topic/artificial-intelligence/feed",
    kind: "rss",
    category: "press",
    baseCredibility: 4,
  },
  {
    slug: "the-information",
    name: "The Information",
    url: "https://www.theinformation.com/",
    feedUrl: "https://www.theinformation.com/feed",
    kind: "rss",
    category: "press",
    // Paywalled, but its scoops routinely break lab news first.
    baseCredibility: 4,
  },
  {
    slug: "venturebeat",
    name: "VentureBeat",
    url: "https://venturebeat.com/",
    // The /category/ai/ feed went stale in May; the site-wide feed is live.
    feedUrl: "https://venturebeat.com/feed/",
    kind: "rss",
    category: "press",
    baseCredibility: 3,
  },
  {
    slug: "techmeme",
    name: "Techmeme",
    url: "https://www.techmeme.com/",
    feedUrl: "https://www.techmeme.com/feed.xml",
    kind: "rss",
    category: "aggregator",
    baseCredibility: 3,
  },
];

// ---------------------------------------------------------------------------
// Independent analysts — often ahead of the press on model and compute detail.
// ---------------------------------------------------------------------------
const ANALYSTS: SourceDef[] = [
  {
    slug: "interconnects",
    name: "Interconnects (Nathan Lambert)",
    url: "https://www.interconnects.ai/",
    feedUrl: "https://www.interconnects.ai/feed",
    kind: "rss",
    category: "analyst",
    baseCredibility: 4,
    pollMinutes: 120,
  },
  {
    slug: "import-ai",
    name: "Import AI (Jack Clark)",
    url: "https://importai.substack.com/",
    feedUrl: "https://importai.substack.com/feed",
    kind: "rss",
    category: "analyst",
    baseCredibility: 4,
    pollMinutes: 240,
  },
  {
    slug: "simon-willison",
    name: "Simon Willison",
    url: "https://simonwillison.net/",
    feedUrl: "https://simonwillison.net/atom/everything/",
    kind: "rss",
    category: "analyst",
    baseCredibility: 4,
  },
  {
    slug: "semianalysis",
    name: "SemiAnalysis",
    url: "https://semianalysis.com/",
    // semianalysis.com/feed/ went stale Sep 2025; the Substack mirror is live.
    feedUrl: "https://semianalysis.substack.com/feed",
    kind: "rss",
    category: "analyst",
    baseCredibility: 4,
    pollMinutes: 240,
  },
];

// ---------------------------------------------------------------------------
// High-volume feeds, deliberately NOT in the registry.
//
// These are correct and verified, but between them they contributed several
// hundred items a day and drowned the feed — arXiv alone was ~450 of the first
// 1,000 articles. They were removed from the running install, and a
// `retired_sources` tombstone stops `db:seed` resurrecting them *there*; a
// fresh database has no tombstones, so leaving them in the registry meant
// every new deployment got them straight back.
//
// Kept here rather than deleted so the verified URLs and settings aren't lost.
// To bring one back, move it into the arrays below and re-seed, or add it
// through the "Add a feed" form on /sources.
// ---------------------------------------------------------------------------
export const HIGH_VOLUME_SOURCES: SourceDef[] = [
  {
    slug: "arxiv-cs-cl",
    name: "arXiv cs.CL (Computation & Language)",
    url: "https://arxiv.org/list/cs.CL/recent",
    feedUrl: "https://rss.arxiv.org/rss/cs.CL",
    kind: "arxiv",
    category: "research",
    baseCredibility: 5,
    pollMinutes: 240,
  },
  {
    slug: "arxiv-cs-lg",
    name: "arXiv cs.LG (Machine Learning)",
    url: "https://arxiv.org/list/cs.LG/recent",
    feedUrl: "https://rss.arxiv.org/rss/cs.LG",
    kind: "arxiv",
    category: "research",
    baseCredibility: 5,
    pollMinutes: 240,
  },
  {
    slug: "arxiv-cs-ai",
    name: "arXiv cs.AI (Artificial Intelligence)",
    url: "https://arxiv.org/list/cs.AI/recent",
    feedUrl: "https://rss.arxiv.org/rss/cs.AI",
    kind: "arxiv",
    category: "research",
    baseCredibility: 5,
    pollMinutes: 240,
  },
  {
    slug: "hf-daily-papers",
    name: "Hugging Face Daily Papers",
    url: "https://huggingface.co/papers",
    feedUrl: "https://huggingface.co/api/daily_papers",
    kind: "hf_papers",
    category: "research",
    baseCredibility: 5,
    // Community upvotes ride along as an impact signal.
    pollMinutes: 120,
  },
  // Reddit's biggest local-model community: high signal, very high volume.
  {
    slug: "reddit-localllama",
    name: "r/LocalLLaMA",
    url: "https://www.reddit.com/r/LocalLLaMA/",
    feedUrl: "https://www.reddit.com/r/LocalLLaMA/.rss",
    kind: "reddit",
    category: "community",
    baseCredibility: 2,
    pollMinutes: 60,
  },
];

// ---------------------------------------------------------------------------
// Tooling — harness, inference engine and framework releases.
// ---------------------------------------------------------------------------
function ghReleases(repo: string): string {
  return `https://github.com/${repo}/releases.atom`;
}

const TOOLING: SourceDef[] = [
  {
    slug: "gh-claude-code",
    name: "Claude Code releases",
    url: "https://github.com/anthropics/claude-code",
    feedUrl: ghReleases("anthropics/claude-code"),
    kind: "github_releases",
    category: "tooling",
    baseCredibility: 5,
    orgSlug: "anthropic",
    pollMinutes: 60,
  },
  {
    slug: "gh-codex",
    name: "OpenAI Codex releases",
    url: "https://github.com/openai/codex",
    feedUrl: ghReleases("openai/codex"),
    kind: "github_releases",
    category: "tooling",
    baseCredibility: 5,
    orgSlug: "openai",
    pollMinutes: 60,
  },
  {
    slug: "gh-vllm",
    name: "vLLM releases",
    url: "https://github.com/vllm-project/vllm",
    feedUrl: ghReleases("vllm-project/vllm"),
    kind: "github_releases",
    category: "tooling",
    baseCredibility: 5,
    pollMinutes: 120,
  },
  {
    slug: "gh-llama-cpp",
    name: "llama.cpp releases",
    url: "https://github.com/ggml-org/llama.cpp",
    feedUrl: ghReleases("ggml-org/llama.cpp"),
    kind: "github_releases",
    category: "tooling",
    baseCredibility: 5,
    pollMinutes: 120,
  },
  {
    slug: "gh-transformers",
    name: "Transformers releases",
    url: "https://github.com/huggingface/transformers",
    feedUrl: ghReleases("huggingface/transformers"),
    kind: "github_releases",
    category: "tooling",
    baseCredibility: 5,
    orgSlug: "huggingface",
    pollMinutes: 120,
  },
];

// ---------------------------------------------------------------------------
// Community and leaks — the low end of the credibility scale by construction.
// ---------------------------------------------------------------------------
const COMMUNITY: SourceDef[] = [
  {
    slug: "testingcatalog",
    name: "TestingCatalog (feature leaks)",
    url: "https://www.testingcatalog.com/",
    feedUrl: "https://www.testingcatalog.com/rss/",
    kind: "rss",
    category: "leaks",
    // Datamined unreleased features. Frequently right, never confirmed.
    baseCredibility: 1,
  },
  {
    slug: "reddit-singularity",
    name: "r/singularity",
    url: "https://www.reddit.com/r/singularity/",
    feedUrl: "https://www.reddit.com/r/singularity/.rss",
    kind: "reddit",
    category: "community",
    baseCredibility: 2,
    pollMinutes: 60,
  },
  {
    slug: "hn-ai",
    name: "Hacker News — AI stories",
    url: "https://news.ycombinator.com/",
    feedUrl:
      "https://hn.algolia.com/api/v1/search_by_date?tags=story&hitsPerPage=50&numericFilters=points%3E20",
    kind: "hn",
    category: "community",
    baseCredibility: 2,
    pollMinutes: 60,
    meta: {
      // Applied client-side: HN carries everything, we only want AI stories.
      queries: ["OpenAI", "Anthropic", "LLM", "Gemini", "DeepSeek", "Nvidia AI"],
    },
  },
];

export const SOURCE_REGISTRY: SourceDef[] = [
  ...FIRST_PARTY,
  ...MODEL_DROPS,
  ...GOOGLE_NEWS,
  ...PRESS,
  ...ANALYSTS,
  ...TOOLING,
  ...COMMUNITY,
];
