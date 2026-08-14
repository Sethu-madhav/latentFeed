/**
 * Model-name extraction for the radar.
 *
 * The same release shows up written a dozen ways — "Qwen3.8-27B", "Qwen 3.8
 * 27b", "Qwen/Qwen3.8-27B", "unsloth/Qwen3.8-27B-GGUF" — so every mention is
 * normalised to one canonical slug before it is counted.
 */

/** Model families we track, mapped to the org that ships them. */
export const MODEL_FAMILIES: { pattern: string; org: string; label: string }[] = [
  { pattern: "gpt", org: "openai", label: "GPT" },
  { pattern: "claude", org: "anthropic", label: "Claude" },
  { pattern: "gemini", org: "google", label: "Gemini" },
  { pattern: "gemma", org: "google", label: "Gemma" },
  { pattern: "grok", org: "xai", label: "Grok" },
  { pattern: "llama", org: "meta", label: "Llama" },
  { pattern: "qwen", org: "alibaba", label: "Qwen" },
  { pattern: "qwq", org: "alibaba", label: "QwQ" },
  { pattern: "kimi", org: "moonshot", label: "Kimi" },
  { pattern: "glm", org: "zai", label: "GLM" },
  { pattern: "deepseek", org: "deepseek", label: "DeepSeek" },
  { pattern: "mistral", org: "mistral", label: "Mistral" },
  { pattern: "magistral", org: "mistral", label: "Magistral" },
  { pattern: "codestral", org: "mistral", label: "Codestral" },
  { pattern: "phi", org: "microsoft", label: "Phi" },
  { pattern: "nova", org: "amazon", label: "Nova" },
  { pattern: "sora", org: "openai", label: "Sora" },
  { pattern: "veo", org: "google", label: "Veo" },
];

/**
 * Named tiers that identify a distinct model, as opposed to a size variant.
 * "Gemini 3.7 Flash" and "Gemini 3.7 Pro" are different models; "Qwen3.8-27B"
 * and "Qwen3.8-9B" are two sizes of one release.
 */
const VARIANTS = [
  "flash",
  "pro",
  "mini",
  "nano",
  "ultra",
  "turbo",
  "opus",
  "sonnet",
  "haiku",
  "sol",
  "air",
  "max",
  "plus",
  "lite",
  "thinking",
  "reasoner",
  "coder",
  "instruct",
  "chat",
  "vision",
] as const;

/**
 * Products that look like a versioned model but aren't one.
 *
 * "Claude Code v2.1.232" is a CLI release from the GitHub feed; matching it
 * put a phantom "Claude Code V2.1" model on the radar with 10 mentions. These
 * are checked against the matched span, so a genuine model mentioned in the
 * same sentence still registers.
 */
const NOT_MODELS = [
  /^claude[\s\-_]?code$/i,
  /^github[\s\-_]?copilot$/i,
  /^gpt[\s\-_]?researcher$/i,
];

const FAMILY_ALTERNATION = MODEL_FAMILIES.map((f) => f.pattern).join("|");
const VARIANT_ALTERNATION = VARIANTS.join("|");

/**
 * family, then a version, with an optional named tier on either side.
 *
 * Both orders occur in the wild: "Gemini 3.7 Flash" puts the tier after the
 * version, "Claude Opus 4.8" puts it before. The version itself may carry a
 * series letter — DeepSeek ships "V4", Moonshot ships "K3".
 *
 * A version is required. Bare "Claude" or "GPT" is a product line, not a
 * release, and registering those would bury the radar in noise.
 */
const MODEL_RE = new RegExp(
  String.raw`\b(${FAMILY_ALTERNATION})` + // family
    String.raw`[\s\-_]?` +
    String.raw`(?:(${VARIANT_ALTERNATION})[\s\-_]?)?` + // tier before version
    String.raw`([kv]?\d+(?:\.\d+)?)` + // version, optional series letter
    // The version must swallow all its digits. Without this the engine
    // backtracks around the size guard below: rejecting "30b" it retries with
    // "3", leaving a phantom "Qwen 3".
    String.raw`(?!\d)` +
    String.raw`(?![bB]\b)` + // not a parameter count: "Qwen 30b", "Llama 70B"
    String.raw`(?:[\s\-_]?(${VARIANT_ALTERNATION}))?`, // tier after version
  "gi",
);

/**
 * Highest plausible whole-number version. Labs are on single digits; anything
 * larger without a decimal point is a parameter count or a token figure that
 * slipped past the size guard ("Qwen 30", "Llama 70").
 */
const MAX_WHOLE_VERSION = 10;

export interface ModelMention {
  /** Canonical key, e.g. "qwen-3.8" or "gemini-3.7-flash". */
  slug: string;
  /** Display form, e.g. "Qwen 3.8" or "Gemini 3.7 Flash". */
  name: string;
  family: string;
  orgSlug: string;
}

/**
 * Find every distinct model release named in the text.
 *
 * Size suffixes (27B, 2.4T) and dated build numbers (-0813) are deliberately
 * dropped: they identify a build of a release, and tracking them separately
 * would split one launch across a dozen radar entries.
 */
export function extractModels(text: string): ModelMention[] {
  const found = new Map<string, ModelMention>();

  for (const match of text.matchAll(MODEL_RE)) {
    const [, rawFamily, variantBefore, rawVersion, variantAfter] = match;

    const family = rawFamily.toLowerCase();
    const def = MODEL_FAMILIES.find((f) => f.pattern === family);
    if (!def) continue;

    const version = rawVersion.toLowerCase();
    // A bare year like "Gemini 2024" is a date, not a version.
    if (/^(19|20)\d{2}$/.test(version)) continue;
    // A large whole number is a size or a stat, not a release.
    if (/^\d+$/.test(version) && Number(version) > MAX_WHOLE_VERSION) continue;

    const variant = (variantBefore ?? variantAfter)?.toLowerCase();

    // Reject tool releases that share a family name with a model line.
    const named = `${rawFamily}${variantBefore ? ` ${variantBefore}` : ""}`;
    if (NOT_MODELS.some((p) => p.test(named.trim()))) continue;

    const slug = [family, version, variant].filter(Boolean).join("-");
    if (found.has(slug)) continue;

    // Series letters are part of the name — "DeepSeek V4", not "DeepSeek 4".
    const displayVersion = /^[kv]/.test(version)
      ? version[0].toUpperCase() + version.slice(1)
      : version;

    found.set(slug, {
      slug,
      name: [
        def.label,
        variantBefore ? titleCase(variantBefore) : null,
        displayVersion,
        variantAfter ? titleCase(variantAfter) : null,
      ]
        .filter(Boolean)
        .join(" "),
      family,
      orgSlug: def.org,
    });
  }

  return [...found.values()];
}

function titleCase(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** Lifecycle stage, ordered from least to most certain. */
export type ModelStatus = "rumoured" | "reported" | "confirmed" | "released";

export const STATUS_ORDER: ModelStatus[] = [
  "rumoured",
  "reported",
  "confirmed",
  "released",
];

export interface StatusInput {
  /** A first-party release exists: weights published, or the lab announced it. */
  hasFirstPartyRelease: boolean;
  /** Best credibility across every mention. */
  topCredibility: number;
  /** Distinct outlets that have mentioned it. */
  sourceCount: number;
}

/**
 * Where a model sits on the leak-to-launch arc.
 *
 * Deliberately evidence-based rather than a guess: "released" requires
 * first-party proof, and nothing below it can reach that label however many
 * outlets repeat the rumour.
 */
export function deriveStatus(input: StatusInput): ModelStatus {
  if (input.hasFirstPartyRelease) return "released";
  if (input.topCredibility >= 4) return "confirmed";
  if (input.topCredibility >= 3 || input.sourceCount >= 2) return "reported";
  return "rumoured";
}

export const STATUS_META: Record<
  ModelStatus,
  { label: string; blurb: string; accent: string }
> = {
  rumoured: {
    label: "Rumoured",
    blurb: "Single low-confidence mention — a leak, datamine or forum sighting",
    accent: "#d97757",
  },
  reported: {
    label: "Reported",
    blurb: "Several outlets or a credible one, but no first-party word",
    accent: "#facc15",
  },
  confirmed: {
    label: "Confirmed",
    blurb: "Well-sourced reporting the lab has not formally shipped",
    accent: "#38bdf8",
  },
  released: {
    label: "Released",
    blurb: "Weights or an official announcement from the lab itself",
    accent: "#4ade80",
  },
};
