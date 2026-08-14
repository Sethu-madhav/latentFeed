import type { ArticleCategory } from "@/db/schema";

/** Display metadata for each category. Order drives the filter rail. */
export const CATEGORY_META: Record<
  ArticleCategory,
  { label: string; short: string; accent: string; order: number }
> = {
  "model-launch": { label: "Model launch", short: "MODEL", accent: "#4ade80", order: 1 },
  "model-leak": { label: "Leak / rumour", short: "LEAK", accent: "#fb923c", order: 2 },
  "feature-launch": { label: "Feature launch", short: "FEATURE", accent: "#38bdf8", order: 3 },
  "tool-launch": { label: "Tool / harness", short: "TOOL", accent: "#a78bfa", order: 4 },
  "research-paper": { label: "Research paper", short: "PAPER", accent: "#818cf8", order: 5 },
  deal: { label: "Deal / funding", short: "DEAL", accent: "#f472b6", order: 6 },
  "infra-compute": { label: "Infra / compute", short: "INFRA", accent: "#facc15", order: 7 },
  benchmark: { label: "Benchmark", short: "BENCH", accent: "#2dd4bf", order: 8 },
  policy: { label: "Policy", short: "POLICY", accent: "#94a3b8", order: 9 },
  people: { label: "People", short: "PEOPLE", accent: "#c084fc", order: 10 },
  other: { label: "Other", short: "OTHER", accent: "#64748b", order: 11 },
};

export const CATEGORY_ORDER = (
  Object.keys(CATEGORY_META) as ArticleCategory[]
).sort((a, b) => CATEGORY_META[a].order - CATEGORY_META[b].order);

/**
 * Signals that an item is unconfirmed. Shared with the credibility scorer,
 * which docks a point for the same language.
 *
 * Each carries a label because the scorer surfaces the reason in the meter's
 * tooltip — decompiling the regex produced nonsense like "leakeds".
 */
export const RUMOUR_PATTERNS: { label: string; re: RegExp }[] = [
  { label: "rumoured", re: /\brumou?r(ed|s)?\b/i },
  { label: "leaked", re: /\bleak(ed|s)?\b/i },
  { label: "reportedly", re: /\breportedly\b/i },
  { label: "allegedly", re: /\ballegedly\b/i },
  { label: "sources say", re: /\bsources? (say|said|tell|told)\b/i },
  {
    label: "people familiar",
    re: /\baccording to (a )?(person|people|sources?) familiar\b/i,
  },
  { label: "datamined", re: /\bdatamined?\b/i },
  { label: "spotted in code", re: /\bspotted in\b/i },
  { label: "hidden strings", re: /\bhidden (code|string|flag)s?\b/i },
  { label: "teased", re: /\bteas(ed|er|ing)\b/i },
  { label: "hints at", re: /\bhints? at\b/i },
  { label: "appears to be", re: /\bappears? to (be )?(prepar|test)/i },
  { label: "unconfirmed", re: /\bunconfirmed\b/i },
  { label: "could launch", re: /\bcould (launch|arrive|ship)\b/i },
  { label: "expected to", re: /\bexpected to (launch|announce|ship)\b/i },
];

/**
 * Vendor customer stories. Lab blogs are full of them and they read like
 * feature news to a keyword matcher ("transformed core marketing processes"),
 * so they're detected explicitly, forced to `other`, and damped in impact.
 */
export const CASE_STUDY_PATTERNS: RegExp[] = [
  // No /i flag: the [A-Z] is load-bearing, it anchors on a company name.
  // "how" itself must still match at the start of a title, hence [Hh].
  /\b[Hh]ow [A-Z][\w&.\s-]{2,30} (uses?|used|builds?|built|transformed|scales?|scaled)\b/,
  /\b(customer|case) stor(y|ies)\b/i,
  /\bwhat (building|running) .{0,40}taught (me|us)\b/i,
  /\b[\w&.\s-]{2,30} (sharpens?|streamlines?|accelerates?|improves?|completes?) .{0,40}\bwith\b.{0,30}\b(chatgpt|claude|gemini|copilot)\b/i,
  /\bsuccess story\b/i,
];

export function isCaseStudy(title: string, summary?: string | null): boolean {
  const text = `${title}\n${summary ?? ""}`;
  return CASE_STUDY_PATTERNS.some((p) => p.test(text));
}

/** Category rules, evaluated in order — first match wins. */
const RULES: { category: ArticleCategory; patterns: RegExp[] }[] = [
  {
    // Checked before model-launch so "GPT-6 rumoured" isn't read as a launch.
    category: "model-leak",
    patterns: [
      /\b(leak|rumou?r|datamined?|spotted|teaser)\w*\b.{0,60}\b(model|gpt|claude|gemini|grok|llama|qwen|kimi|glm|deepseek)\b/i,
      /\b(model|gpt|claude|gemini|grok|llama|qwen|kimi|glm|deepseek)\b.{0,60}\b(leak|rumou?r|datamined?|spotted|unreleased|upcoming|teaser)\w*\b/i,
      /\bnext-gen\w*\b.{0,40}\b(model|llm)\b.{0,40}\b(reportedly|rumou?r|expected)/i,
      /\bhidden (string|code|flag)s?\b/i,
    ],
  },
  {
    category: "model-launch",
    patterns: [
      /\b(introduc|announc|releas|launch|unveil|debut|present)\w*\b.{0,50}\b(gpt|claude|gemini|gemma|grok|llama|qwen|kimi|glm|deepseek|mistral|nova|phi)[\w.-]*\b/i,
      /\b(gpt|claude|gemini|gemma|grok|llama|qwen|kimi|glm|deepseek)[\s-]?[\d.]+\w*\b.{0,40}\b(is (here|live|out)|now available|available now|released|launches)\b/i,
      /\bnew (frontier |flagship |reasoning |open[- ]?(weight|source) )?model\b/i,
      /\bopen[- ]?(weight|source)s?\b.{0,30}\b(model|releas|drop)/i,
      /\bmodel card\b/i,
      /\bwe(?:'re| are) (releasing|introducing|launching)\b/i,
      // Catches named models we don't have in the dictionary yet
      // ("Daybreak models are now available on AWS").
      /\bmodels?\b.{0,20}\b(is|are) now (available|generally available)\b/i,
      /\bintroducing\b.{0,30}\bmodels?\b/i,
    ],
  },
  {
    category: "research-paper",
    patterns: [
      /\barxiv\b/i,
      /\b(we (propose|present|introduce)|this paper|our method|empirical study)\b/i,
      /\b(pre|post)[- ]?training (method|recipe|technique)\b/i,
      /\bablation\b/i,
    ],
  },
  {
    category: "tool-launch",
    patterns: [
      /\b(sdk|cli|api|harness|framework|library|toolkit|agent framework)\b.{0,40}\b(launch|releas|introduc|announc|ship|now available|v?\d+\.\d+)/i,
      /\b(releas|ship|version|update)\w*\b.{0,30}\bv?\d+\.\d+(\.\d+)?\b/i,
      /\b(claude code|codex|cursor|copilot|vllm|llama\.cpp|transformers|langchain|ollama)\b/i,
      /\bmodel context protocol\b|\bmcp server\b/i,
      /\bdeveloper (tool|platform|preview)\b/i,
    ],
  },
  {
    category: "deal",
    patterns: [
      /\b(raises?|raised|funding round|series [a-g]\b|valuation|valued at)\b/i,
      /\b(acquir|acquisition|merger|buys?|bought|takeover)\w*\b/i,
      /\b(invest|investment|stake|backing)\w*\b.{0,30}\b(billion|million|\$\d)/i,
      /\b(partnership|deal|agreement|contract)\b.{0,40}\b(billion|million|\$\d|compute|cloud)/i,
      /\bipo\b|\bgoes public\b/i,
    ],
  },
  {
    category: "infra-compute",
    patterns: [
      /\bdata ?cent(er|re)s?\b/i,
      /\b(gigawatt|megawatt|\d+\s?(gw|mw)\b)/i,
      /\b(gpu|tpu|accelerator)s?\b.{0,40}\b(cluster|supercomputer|deploy|order|shipment|capacity)/i,
      /\b(blackwell|rubin|hopper|h100|h200|gb200|gb300|trainium|tpu v\d)\b/i,
      /\b(chip|silicon|fab|foundry|wafer)\b.{0,40}\b(export|supply|capacity|production)/i,
      /\bcompute (cluster|capacity|deal|buildout)\b/i,
    ],
  },
  {
    category: "benchmark",
    patterns: [
      /\b(swe[- ]?bench|mmlu|gpqa|humaneval|arc[- ]agi|aime|lmsys|chatbot arena|livebench|frontiermath|hle)\b/i,
      /\b(benchmark|eval(uation)?s?|leaderboard)\b.{0,40}\b(top|beat|lead|score|record|state[- ]of[- ]the[- ]art|sota)/i,
      /\b(tops?|beats?|outperforms?|surpasses)\b.{0,30}\b(on|in)\b.{0,20}\b(benchmark|eval|test)/i,
    ],
  },
  {
    category: "feature-launch",
    patterns: [
      /\b(adds?|adding|rolls? out|rolling out|brings?|introduc\w+|now supports?|enables?)\b.{0,50}\b(feature|mode|support|integration|capability|tool|memory|voice|canvas|agent)/i,
      /\b(available (to|for)|expands? to|opens? up)\b.{0,40}\b(users?|subscribers?|customers?|everyone|free tier)/i,
      /\b(app|mobile|desktop|web) (update|version|app)\b/i,
      /\bnew (setting|option|interface|ui|experience)\b/i,
      /\btesting\b.{0,30}\bin (chatgpt|claude|gemini|grok|copilot)\b/i,
      /\b(is|are) coming to\b.{0,40}\b(chatgpt|claude|gemini|grok|copilot|users?)\b/i,
      /\b(preview|previewing|early access|beta)\b.{0,30}\b(mode|feature)\b/i,
    ],
  },
  {
    category: "policy",
    patterns: [
      /\b(regulat|legislat|lawsuit|sue[sd]?|court|antitrust|copyright|ban(ned|s)?)\w*\b/i,
      /\b(eu ai act|executive order|white house|congress|senate|parliament|export controls?)\b/i,
      /\b(safety (institute|framework|policy)|governance|compliance)\b/i,
    ],
  },
  {
    category: "people",
    patterns: [
      /\b(hires?|hired|joins?|joined|poach\w*|departs?|leaves|leaving|resigns?|steps? down|ousted|fired)\b.{0,40}\b(ceo|cto|researcher|scientist|lead|head of|vp|executive|team)/i,
      /\bappoints?\b.{0,50}\b(as )?(chief|ceo|cto|president|head|director|vp)\b/i,
      /\bnames?\b.{0,40}\bas (its |the )?(chief|ceo|cto|president|head)\b/i,
      /\bchief \w+ officer\b/i,
      /\b(ceo|cto|chief scientist|co-?founder)\b.{0,30}\b(appoint|name[sd]?|replac|exit|out)/i,
      /\btalent war\b/i,
    ],
  },
];

/**
 * Assign a category from title + summary using ordered keyword rules.
 *
 * `hints` lets a fetcher assert what it knows for certain — a GitHub release is
 * a tool launch, an arXiv entry is a paper — which beats guessing from text.
 */
export function classify(
  title: string,
  summary?: string | null,
  hints?: { isRelease?: boolean; isPaper?: boolean; isModelRelease?: boolean },
): ArticleCategory {
  if (hints?.isPaper) return "research-paper";
  // Weights published under a lab's own account are a launch, full stop.
  if (hints?.isModelRelease) return "model-launch";
  if (hints?.isRelease) return "tool-launch";

  // Vendor case studies quote enough product language to trip several rules.
  if (isCaseStudy(title, summary)) return "other";

  const text = `${title}\n${summary ?? ""}`;

  for (const rule of RULES) {
    if (rule.patterns.some((p) => p.test(text))) return rule.category;
  }
  return "other";
}

/** The hedging phrase found in the text, or null. */
export function hasRumourLanguage(text: string): string | null {
  return RUMOUR_PATTERNS.find((p) => p.re.test(text))?.label ?? null;
}
