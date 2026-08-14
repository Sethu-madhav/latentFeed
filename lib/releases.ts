/**
 * Parsing for the release tracker.
 *
 * The tracked repos use four different tag conventions, so nothing here can
 * assume semver: `v2.1.232` (claude-code), `rust-v0.148.0-alpha.17` (codex),
 * `b10434` (llama.cpp build numbers) and `v0.27.2rc0` (vllm, no separator
 * before the release-candidate marker).
 */

/** "https://github.com/owner/repo/releases/tag/x" → "owner/repo" */
export function repoFromReleaseUrl(url: string): string | null {
  const match = url.match(/github\.com\/([^/]+\/[^/]+)\/releases\/tag\//);
  return match ? match[1] : null;
}

/** ".../releases/tag/rust-v0.148.0-alpha.17" → "rust-v0.148.0-alpha.17" */
export function tagFromUrl(url: string): string | null {
  const match = url.match(/\/releases\/tag\/(.+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

export interface ParsedTag {
  /** Display version with any component prefix stripped: "0.148.0-alpha.17". */
  version: string;
  /** alpha / beta / rc / dev, when the tag marks one. */
  channel: string | null;
  isPrerelease: boolean;
  /** True for date- or counter-style tags such as llama.cpp's b10434. */
  isBuild: boolean;
}

const PRERELEASE_RE = /(alpha|beta|rc|dev|nightly|preview|pre)/i;

export function parseTag(tag: string): ParsedTag {
  // Monorepos prefix the component: "rust-v0.148.0-alpha.17".
  const withoutPrefix = tag.replace(/^[a-z][\w.]*-(?=v?\d)/i, "");
  const version = withoutPrefix.replace(/^v/i, "");

  // A bare letter-and-digits tag is a build counter, not a version.
  const isBuild = /^[a-z]\d+$/i.test(version);

  const channelMatch = isBuild ? null : version.match(PRERELEASE_RE);

  return {
    version,
    channel: channelMatch ? channelMatch[1].toLowerCase() : null,
    isPrerelease: Boolean(channelMatch),
    isBuild,
  };
}

/** Friendly project name from a repo path: "ggml-org/llama.cpp" → "llama.cpp". */
export function projectName(repo: string): string {
  return repo.split("/")[1] ?? repo;
}

/**
 * Releases per week over the observed window, as a crude cadence signal.
 *
 * Deliberately simple: it answers "is this project shipping daily or monthly",
 * which is all the tracker claims to tell you.
 */
export function releasesPerWeek(dates: Date[]): number {
  if (dates.length < 2) return 0;

  const times = dates.map((d) => d.getTime());
  const spanMs = Math.max(...times) - Math.min(...times);
  const spanWeeks = spanMs / (7 * 86_400_000);

  // Everything landed at once — not enough spread to infer a rate.
  if (spanWeeks < 0.05) return 0;
  return dates.length / spanWeeks;
}

/** How to describe a cadence in words. */
export function cadenceLabel(perWeek: number): string {
  if (perWeek <= 0) return "—";
  if (perWeek >= 14) return "multiple daily";
  if (perWeek >= 5) return "~daily";
  if (perWeek >= 1.5) return "few per week";
  if (perWeek >= 0.5) return "~weekly";
  return "occasional";
}
