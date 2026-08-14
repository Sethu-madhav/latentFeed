import { env } from "@/lib/env";

export const RAW_CONTENT_LIMIT = 4000;

/** Minimum gap between requests to the same host. */
const HOST_THROTTLE_MS = 1500;

/**
 * Hosts that need more room than the default. Reddit 429s two subreddit feeds
 * fetched 1.5s apart even with a declared UA.
 */
const HOST_THROTTLE_OVERRIDES: { pattern: RegExp; ms: number }[] = [
  { pattern: /(^|\.)reddit\.com$/, ms: 6000 },
];

const lastHitAt = new Map<string, number>();

function throttleFor(host: string): number {
  return (
    HOST_THROTTLE_OVERRIDES.find((o) => o.pattern.test(host))?.ms ??
    HOST_THROTTLE_MS
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Space out requests per host, serialising bursts to the same publisher. */
async function throttle(url: string): Promise<void> {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return;
  }
  const last = lastHitAt.get(host) ?? 0;
  const wait = throttleFor(host) - (Date.now() - last);
  if (wait > 0) await sleep(wait);
  lastHitAt.set(host, Date.now());
}

export interface PoliteFetchOptions {
  /** Sent as If-None-Match; a 304 back means skip the parse entirely. */
  etag?: string | null;
  lastModified?: string | null;
  timeoutMs?: number;
  retries?: number;
  accept?: string;
}

/**
 * Fetch with the configured UA, a timeout, per-host throttling, conditional
 * GET, and backoff on 429/5xx. Every outbound feed request goes through here.
 *
 * Throws on non-retryable HTTP errors so the caller records the failure and
 * the source's failure counter advances toward auto-disable.
 */
export async function politeFetch(
  url: string,
  opts: PoliteFetchOptions = {},
): Promise<Response> {
  const { timeoutMs = 15_000, retries = 2 } = opts;

  const headers: Record<string, string> = {
    "user-agent": env.userAgent,
    accept: opts.accept ?? "application/rss+xml, application/xml, text/xml, application/atom+xml, application/json;q=0.9, */*;q=0.8",
    "accept-language": "en-US,en;q=0.9",
  };
  if (opts.etag) headers["if-none-match"] = opts.etag;
  if (opts.lastModified) headers["if-modified-since"] = opts.lastModified;

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    await throttle(url);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers,
        signal: controller.signal,
        redirect: "follow",
      });

      // 429/5xx are worth another try after a pause; everything else is final.
      if (res.status === 429 || res.status >= 500) {
        const retryAfter = Number(res.headers.get("retry-after"));
        const backoff = Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(retryAfter * 1000, 30_000)
          : 1000 * 2 ** attempt;
        lastError = new Error(`HTTP ${res.status} for ${url}`);
        if (attempt < retries) {
          await sleep(backoff);
          continue;
        }
      }
      return res;
    } catch (err) {
      lastError = err;
      if (attempt < retries) await sleep(1000 * 2 ** attempt);
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`fetch failed for ${url}`);
}

/**
 * Coerce a parsed XML value to plain text.
 *
 * rss-parser hands back whatever xml2js produced, which is only sometimes a
 * string: an element carrying attributes becomes `{ _: "text", $: {...} }`, a
 * repeated element becomes an array, and an empty one becomes a null-prototype
 * object. Passing that straight through reaches the driver as a value with no
 * prototype and takes the whole feed down, so every field sourced from the
 * parser goes through here first.
 */
export function asText(value: unknown): string | undefined {
  if (value == null) return undefined;

  if (typeof value === "string") return value.trim() || undefined;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const text = asText(entry);
      if (text) return text;
    }
    return undefined;
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return (
      asText(record._) ??
      asText(record["#text"]) ??
      asText(record.name) ??
      asText(record.$t) ??
      undefined
    );
  }

  return undefined;
}

/** Collapse HTML to readable plain text. Feeds mix escaped and raw markup. */
export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    // Numeric entities in both forms — feeds mix &#8217; and &#x2019; freely.
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}
