/**
 * The companies latentFeed tracks.
 *
 * `aliases` are matched case-insensitively on word boundaries against title +
 * summary. Deliberately no bare short tokens ("R1", "V3", "GLM" alone) — they
 * false-positive on unrelated text, so only the qualified forms are listed.
 * `domains` are the hosts that count as the org speaking for itself, which is
 * what earns an article the first-party credibility bonus.
 */
export interface OrgDef {
  slug: string;
  name: string;
  kind: "lab" | "chip" | "cloud";
  aliases: string[];
  domains: string[];
  accent: string;
  sortOrder: number;
}

/** The 12 the user asked for, in their stated order. */
export const PRIMARY_ORGS: OrgDef[] = [
  {
    slug: "openai",
    name: "OpenAI",
    kind: "lab",
    aliases: [
      "OpenAI",
      "ChatGPT",
      "GPT-4",
      "GPT-4o",
      "GPT-5",
      "GPT-6",
      "Sora",
      "DALL-E",
      "DALLE",
      "Codex",
      "Whisper",
      "Sam Altman",
      "Operator",
      "SearchGPT",
    ],
    domains: ["openai.com"],
    accent: "#10a37f",
    sortOrder: 1,
  },
  {
    slug: "anthropic",
    name: "Anthropic",
    kind: "lab",
    aliases: [
      "Anthropic",
      "Claude",
      "Claude Code",
      "Claude Sonnet",
      "Claude Opus",
      "Claude Haiku",
      "Model Context Protocol",
      "Dario Amodei",
      "Constitutional AI",
    ],
    domains: ["anthropic.com", "claude.ai"],
    accent: "#d97757",
    sortOrder: 2,
  },
  {
    slug: "xai",
    name: "xAI",
    kind: "lab",
    aliases: ["xAI", "Grok", "Colossus", "Elon Musk"],
    domains: ["x.ai"],
    accent: "#e8e8e8",
    sortOrder: 3,
  },
  {
    slug: "google",
    name: "Google / DeepMind",
    kind: "lab",
    aliases: [
      "Google DeepMind",
      "DeepMind",
      "Google AI",
      "Gemini",
      "Gemma",
      "AlphaFold",
      "AlphaGo",
      "NotebookLM",
      "Vertex AI",
      "Google Research",
      "Demis Hassabis",
      "Sundar Pichai",
      "Veo",
      "Imagen",
      "TPU",
      "Trillium",
    ],
    domains: [
      "deepmind.google",
      "blog.google",
      "research.google",
      "ai.google",
      "developers.googleblog.com",
    ],
    accent: "#4285f4",
    sortOrder: 4,
  },
  {
    slug: "meta",
    name: "Meta",
    kind: "lab",
    aliases: [
      "Meta AI",
      "Llama",
      "LLaMA",
      "FAIR",
      "Segment Anything",
      "Superintelligence Labs",
      "Yann LeCun",
      "Mark Zuckerberg",
      "PyTorch",
    ],
    domains: ["ai.meta.com", "about.fb.com", "meta.com"],
    accent: "#0064e0",
    sortOrder: 5,
  },
  {
    slug: "thinking-machines",
    name: "Thinking Machines",
    kind: "lab",
    aliases: ["Thinking Machines", "Mira Murati", "Tinker"],
    domains: ["thinkingmachines.ai"],
    accent: "#b47cff",
    sortOrder: 6,
  },
  {
    slug: "ssi",
    name: "SSI",
    kind: "lab",
    aliases: ["Safe Superintelligence", "SSI Inc", "Ilya Sutskever"],
    domains: ["ssi.inc"],
    accent: "#9aa0ff",
    sortOrder: 7,
  },
  {
    slug: "nvidia",
    name: "Nvidia",
    kind: "chip",
    aliases: [
      "Nvidia",
      "NVIDIA",
      "Blackwell",
      "Rubin",
      "Hopper",
      "H100",
      "H200",
      "GB200",
      "GB300",
      "CUDA",
      "NVLink",
      "DGX",
      "Jensen Huang",
      "Grace Blackwell",
    ],
    domains: ["nvidia.com", "blogs.nvidia.com", "nvidianews.nvidia.com"],
    accent: "#76b900",
    sortOrder: 8,
  },
  {
    slug: "deepseek",
    name: "DeepSeek",
    kind: "lab",
    aliases: [
      "DeepSeek",
      "DeepSeek-R1",
      "DeepSeek R1",
      "DeepSeek-V3",
      "DeepSeek V3",
      "DeepSeek-V4",
    ],
    domains: ["deepseek.com", "api-docs.deepseek.com"],
    accent: "#4d6bfe",
    sortOrder: 9,
  },
  {
    slug: "moonshot",
    name: "Moonshot (Kimi)",
    kind: "lab",
    aliases: ["Moonshot AI", "Moonshot", "Kimi", "Kimi K2", "Kimi K1.5"],
    domains: ["moonshot.cn", "moonshotai.com", "moonshotai.github.io"],
    accent: "#00d3aa",
    sortOrder: 10,
  },
  {
    slug: "zai",
    name: "Z.AI (GLM)",
    kind: "lab",
    aliases: ["Z.AI", "Zhipu", "ChatGLM", "GLM-4", "GLM-5", "GLM-4.5", "Zhipu AI"],
    domains: ["z.ai", "zhipuai.cn", "bigmodel.cn"],
    accent: "#ffb020",
    sortOrder: 11,
  },
  {
    slug: "alibaba",
    name: "Alibaba (Qwen)",
    kind: "lab",
    aliases: [
      "Qwen",
      "Qwen3",
      "Qwen2.5",
      "Tongyi",
      "Alibaba Cloud",
      "Wan 2",
      "QwQ",
    ],
    domains: ["qwenlm.github.io", "alibabacloud.com", "tongyi.aliyun.com"],
    accent: "#ff6a00",
    sortOrder: 12,
  },
];

/**
 * Secondary players — not the user's focus list, but they appear constantly in
 * AI news and tagging them keeps the "other" bucket from swallowing real signal.
 */
export const SECONDARY_ORGS: OrgDef[] = [
  {
    slug: "mistral",
    name: "Mistral",
    kind: "lab",
    aliases: ["Mistral AI", "Mistral", "Magistral", "Codestral", "Le Chat"],
    domains: ["mistral.ai"],
    accent: "#fa5111",
    sortOrder: 50,
  },
  {
    slug: "microsoft",
    name: "Microsoft",
    kind: "cloud",
    aliases: ["Microsoft", "Azure AI", "Copilot", "Satya Nadella", "MAI-"],
    domains: ["microsoft.com", "azure.microsoft.com"],
    accent: "#00a4ef",
    sortOrder: 51,
  },
  {
    slug: "amazon",
    name: "Amazon / AWS",
    kind: "cloud",
    aliases: ["AWS", "Amazon Bedrock", "Trainium", "Inferentia", "Amazon Nova"],
    domains: ["aws.amazon.com", "amazon.science"],
    accent: "#ff9900",
    sortOrder: 52,
  },
  {
    slug: "apple",
    name: "Apple",
    kind: "lab",
    aliases: ["Apple Intelligence", "Apple ML", "Tim Cook"],
    domains: ["apple.com", "machinelearning.apple.com"],
    accent: "#a2aaad",
    sortOrder: 53,
  },
  {
    slug: "huggingface",
    name: "Hugging Face",
    kind: "lab",
    aliases: ["Hugging Face", "HuggingFace", "Transformers library"],
    domains: ["huggingface.co"],
    accent: "#ffd21e",
    sortOrder: 54,
  },
  {
    slug: "cursor",
    name: "Cursor",
    kind: "lab",
    aliases: ["Cursor", "Anysphere", "Composer"],
    domains: ["cursor.com", "cursor.sh"],
    accent: "#c8c8c8",
    sortOrder: 55,
  },
  {
    slug: "perplexity",
    name: "Perplexity",
    kind: "lab",
    aliases: ["Perplexity", "Comet browser"],
    domains: ["perplexity.ai"],
    accent: "#20808d",
    sortOrder: 56,
  },
];

export const ALL_ORGS: OrgDef[] = [...PRIMARY_ORGS, ...SECONDARY_ORGS];

export const ORG_BY_SLUG = new Map(ALL_ORGS.map((o) => [o.slug, o]));

/** Every first-party domain → org slug, used by the credibility scorer. */
export const FIRST_PARTY_DOMAINS = new Map<string, string>(
  ALL_ORGS.flatMap((o) => o.domains.map((d) => [d, o.slug] as const)),
);

/**
 * Precompiled alias matchers. Word-boundary anchored so "Grok" doesn't fire on
 * "Grokking" and "Sora" doesn't fire inside "Sorage". Longest alias first so
 * "Claude Code" is considered before "Claude".
 */
const ALIAS_PATTERNS: { slug: string; re: RegExp }[] = ALL_ORGS.flatMap((org) =>
  [...org.aliases]
    .sort((a, b) => b.length - a.length)
    .map((alias) => ({
      slug: org.slug,
      re: new RegExp(`(?<![\\w-])${escapeRegex(alias)}(?![\\w-])`, "i"),
    })),
);

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Find every tracked org mentioned in the text, plus any implied by the URL's
 * host. Returns slugs ordered by the org's sortOrder so primary labs lead.
 */
export function matchOrgs(text: string, url?: string): string[] {
  const found = new Set<string>();

  for (const { slug, re } of ALIAS_PATTERNS) {
    if (found.has(slug)) continue;
    if (re.test(text)) found.add(slug);
  }

  if (url) {
    const host = hostOf(url);
    if (host) {
      for (const [domain, slug] of FIRST_PARTY_DOMAINS) {
        if (host === domain || host.endsWith(`.${domain}`)) found.add(slug);
      }
    }
  }

  return [...found].sort(
    (a, b) =>
      (ORG_BY_SLUG.get(a)?.sortOrder ?? 999) -
      (ORG_BY_SLUG.get(b)?.sortOrder ?? 999),
  );
}

/** Host without `www.`, or null if the URL doesn't parse. */
export function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

/** The org slug that owns this host, if it's a first-party domain. */
export function firstPartyOrg(url: string): string | null {
  const host = hostOf(url);
  if (!host) return null;
  for (const [domain, slug] of FIRST_PARTY_DOMAINS) {
    if (host === domain || host.endsWith(`.${domain}`)) return slug;
  }
  return null;
}
