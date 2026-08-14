/**
 * Topic tags, extracted with a keyword dictionary.
 *
 * These are the cross-cutting themes a category can't express: an article can
 * be a model launch *about* reasoning models *with* open weights. Section 3
 * layers LLM-suggested tags on top; the dictionary stays as the free baseline.
 */

/** tag → patterns that imply it. */
const TAG_PATTERNS: Record<string, RegExp[]> = {
  reasoning: [/\breasoning model\b/i, /\bchain[- ]of[- ]thought\b/i, /\btest[- ]time compute\b/i, /\bthinking (mode|budget)\b/i, /\bo[34](-mini)?\b/],
  agents: [/\bagent(ic|s)?\b/i, /\btool[- ]use\b/i, /\bcomputer[- ]use\b/i, /\bmulti[- ]agent\b/i],
  coding: [/\bcod(e|ing) (model|assistant|agent)\b/i, /\bswe[- ]?bench\b/i, /\bsoftware engineer(ing)? (agent|benchmark)\b/i, /\bide\b/i, /\bautocomplete\b/i],
  "open-weights": [/\bopen[- ]?weights?\b/i, /\bopen[- ]?sourc\w+ (the )?model\b/i, /\bapache 2\.0\b/i, /\bmit licen[cs]e\b/i, /\bweights (are )?(released|available)\b/i],
  multimodal: [/\bmultimodal\b/i, /\bvision[- ]language\b/i, /\bimage (generation|understanding)\b/i, /\bvideo (generation|model)\b/i, /\btext[- ]to[- ](image|video|speech)\b/i],
  voice: [/\bvoice (mode|assistant|model)\b/i, /\bspeech[- ]to[- ]text\b/i, /\btext[- ]to[- ]speech\b/i, /\brealtime api\b/i],
  "context-window": [/\bcontext (window|length)\b/i, /\b\d+[km] (token|context)\b/i, /\blong[- ]context\b/i],
  rag: [/\brag\b/i, /\bretrieval[- ]augmented\b/i, /\bvector (database|search)\b/i, /\bembedding model\b/i],
  "fine-tuning": [/\bfine[- ]?tun\w+\b/i, /\blora\b/i, /\bdistillation\b/i, /\bdistill\w*\b/i, /\bpost[- ]training\b/i],
  rl: [/\breinforcement learning\b/i, /\brlhf\b/i, /\brlaif\b/i, /\bdpo\b/i, /\bgrpo\b/i, /\breward model\b/i],
  safety: [/\b(ai )?safety\b/i, /\balignment\b/i, /\bred[- ]team\w*\b/i, /\bjailbreak\w*\b/i, /\bguardrails?\b/i, /\binterpretability\b/i],
  pricing: [/\bpric(e|ing)\b/i, /\bper (million )?tokens?\b/i, /\bcheaper\b/i, /\bcost (per|reduction)\b/i, /\bfree tier\b/i, /\bsubscription\b/i],
  "chips-gpu": [/\bgpus?\b/i, /\btpus?\b/i, /\bblackwell\b/i, /\brubin\b/i, /\bh100\b/i, /\bh200\b/i, /\btrainium\b/i, /\baccelerator\b/i, /\binference chip\b/i],
  datacenter: [/\bdata ?cent(er|re)\b/i, /\bgigawatt\b/i, /\bpower (purchase|deal|grid)\b/i, /\bnuclear\b/i, /\bcapacity buildout\b/i],
  funding: [/\braises?\b/i, /\bfunding\b/i, /\bvaluation\b/i, /\bseries [a-g]\b/i, /\binvestment\b/i],
  china: [/\bchina\b/i, /\bchinese\b/i, /\bbeijing\b/i, /\bexport controls?\b/i, /\bhuawei\b/i],
  enterprise: [/\benterprise\b/i, /\bb2b\b/i, /\bfortune 500\b/i, /\bdeployment at scale\b/i],
  robotics: [/\brobot(ics|s)?\b/i, /\bhumanoid\b/i, /\bembodied\b/i],
  mcp: [/\bmodel context protocol\b/i, /\bmcp\b/i],
  benchmark: [/\bbenchmark\b/i, /\bleaderboard\b/i, /\bmmlu\b/i, /\bgpqa\b/i, /\barc[- ]agi\b/i, /\bchatbot arena\b/i],
  "open-source": [/\bopen[- ]sourc\w+\b/i, /\bgithub\.com\b/i],
};

const COMPILED = Object.entries(TAG_PATTERNS);

/** Every tag the dictionary can produce, for the filter rail. */
export const ALL_TAGS = Object.keys(TAG_PATTERNS).sort();

/**
 * Extract topic tags from text, merged with any the fetcher supplied
 * (Hugging Face hands us `ai_keywords` for free).
 */
export function extractTags(
  title: string,
  summary?: string | null,
  extra?: string[],
): string[] {
  const text = `${title}\n${summary ?? ""}`;
  const tags = new Set<string>();

  for (const [tag, patterns] of COMPILED) {
    if (patterns.some((p) => p.test(text))) tags.add(tag);
  }

  for (const raw of extra ?? []) {
    const tag = normalizeTag(raw);
    if (tag) tags.add(tag);
  }

  // Cap so one paper's keyword list can't dominate the tag filter.
  return [...tags].slice(0, 12);
}

/** Lowercase kebab-case, dropping anything too long or too vague to filter on. */
export function normalizeTag(raw: string): string | null {
  const tag = raw
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (tag.length < 2 || tag.length > 28) return null;
  if (tag.split("-").length > 3) return null;
  return tag;
}
