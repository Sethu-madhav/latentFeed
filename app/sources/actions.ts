"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import { retiredSources, sources, type SourceKind } from "@/db/schema";
import { isAdminNow } from "@/lib/auth";
import { ALL_ORGS } from "@/lib/orgs";
import { SOURCE_REGISTRY } from "@/lib/sources/registry";
import { probeFeed, slugify, uniqueSlug } from "@/lib/sources/validate";

const SOURCE_KINDS = [
  "rss",
  "github_releases",
  "google_news",
  "arxiv",
  "hf_papers",
  "hf_models",
  "hn",
  "reddit",
] as const satisfies readonly SourceKind[];

const SOURCE_CATEGORIES = [
  "first_party",
  "press",
  "analyst",
  "research",
  "tooling",
  "community",
  "leaks",
  "aggregator",
] as const;

const ORG_SLUGS = ALL_ORGS.map((o) => o.slug);

export interface ActionResult {
  ok: boolean;
  message?: string;
}

/**
 * Every action in this file is admin-only.
 *
 * Sign-up is open, so being authenticated grants nothing here. These are not
 * merely settings: `articles.source_id` is `on delete cascade`, so
 * `deleteSource` destroys a feed's entire article history, and that history is
 * shared — it feeds corroboration counts and therefore every reader's
 * credibility scores. `testFeed` is included because it makes the server fetch
 * an arbitrary URL chosen by the caller.
 *
 * A server action is a public HTTP endpoint. Hiding the buttons in the UI is
 * presentation, not protection; the check has to live here, where the write
 * actually happens.
 *
 * Uses the database-backed check rather than the session's role, so that
 * revoking an admin takes effect immediately instead of when their 90-day
 * token happens to expire.
 */
async function denyNonAdmin(): Promise<ActionResult | null> {
  if (await isAdminNow()) return null;
  return { ok: false, message: "Only an admin can manage sources." };
}

/** Both views depend on the source list, so both are invalidated together. */
function revalidateAll(): void {
  revalidatePath("/sources");
  revalidatePath("/");
}

/**
 * Flag a row as user-owned. `db:seed` checks this and leaves such rows alone,
 * so edits made here survive a re-seed of the stock registry.
 */
const markManaged = sql`coalesce(${sources.meta}, '{}'::jsonb) || '{"managedBy":"user"}'::jsonb`;

// ---------------------------------------------------------------------------
// Polling on/off — distinct from muting.
// ---------------------------------------------------------------------------

/**
 * Stop or resume polling. Re-enabling also clears the failure counter, since
 * the usual reason a source is off is that it auto-disabled after 5 errors and
 * leaving the count would disable it again on the next hiccup.
 */
export async function setSourceEnabled(
  id: number,
  enabled: boolean,
): Promise<ActionResult> {
  const denied = await denyNonAdmin();
  if (denied) return denied;
  await db
    .update(sources)
    .set(
      enabled
        ? { enabled: true, consecutiveFailures: 0, disabledReason: null }
        : { enabled: false, disabledReason: "turned off manually" },
    )
    .where(eq(sources.id, id));

  revalidateAll();
  return { ok: true, message: enabled ? "Polling resumed" : "Polling stopped" };
}

/**
 * Hide a source from the feed while still ingesting it.
 *
 * Kept separate from `enabled` on purpose: muting kills the noise but keeps
 * collecting, so the source still counts toward corroboration and its history
 * is there if you unmute later.
 */
export async function setSourceMuted(
  id: number,
  muted: boolean,
): Promise<ActionResult> {
  const denied = await denyNonAdmin();
  if (denied) return denied;
  await db
    .update(sources)
    .set({ mutedAt: muted ? new Date() : null })
    .where(eq(sources.id, id));

  revalidateAll();
  return { ok: true, message: muted ? "Hidden from feed" : "Shown in feed" };
}

/** Clear the failure counter without changing anything else. */
export async function resetSourceFailures(id: number): Promise<ActionResult> {
  const denied = await denyNonAdmin();
  if (denied) return denied;
  await db
    .update(sources)
    .set({ consecutiveFailures: 0, disabledReason: null, enabled: true })
    .where(eq(sources.id, id));

  revalidateAll();
  return { ok: true, message: "Failure count cleared" };
}

// ---------------------------------------------------------------------------
// Edit
// ---------------------------------------------------------------------------

const updateSchema = z.object({
  id: z.coerce.number().int().positive(),
  name: z.string().trim().min(1).max(120),
  feedUrl: z.string().trim().url().max(1000),
  baseCredibility: z.coerce.number().int().min(1).max(5),
  pollMinutes: z.coerce.number().int().min(5).max(1440),
  orgSlug: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .refine((v) => v === null || ORG_SLUGS.includes(v), "unknown company")
    .nullable(),
});

export async function updateSource(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const denied = await denyNonAdmin();
  if (denied) return denied;
  const parsed = updateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { id, ...values } = parsed.data;

  await db
    .update(sources)
    .set({ ...values, meta: markManaged })
    .where(eq(sources.id, id));

  revalidateAll();
  return { ok: true, message: "Saved" };
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

/**
 * Remove a source and everything it contributed.
 *
 * `articles.source_id` cascades, so this deletes the source's articles too.
 * The UI shows the article count on the confirm step — this is not recoverable
 * without a re-ingest, and older items may be past their feed's window.
 */
export async function deleteSource(id: number): Promise<ActionResult> {
  const denied = await denyNonAdmin();
  if (denied) return denied;
  const [row] = await db
    .select({ name: sources.name, slug: sources.slug })
    .from(sources)
    .where(eq(sources.id, id))
    .limit(1);

  if (!row) return { ok: false, message: "Source not found" };

  await db.delete(sources).where(eq(sources.id, id));

  // Remember the removal, or the next `db:seed` puts the feed straight back
  // along with everything it ingests.
  await db
    .insert(retiredSources)
    .values({ slug: row.slug, name: row.name })
    .onConflictDoNothing();

  revalidateAll();
  return { ok: true, message: `Removed ${row.name}` };
}

/** Undo a removal so the next seed restores the feed. */
export async function restoreSource(slug: string): Promise<ActionResult> {
  const denied = await denyNonAdmin();
  if (denied) return denied;
  await db.delete(retiredSources).where(eq(retiredSources.slug, slug));

  const def = SOURCE_REGISTRY.find((s) => s.slug === slug);
  if (!def) {
    revalidateAll();
    return {
      ok: true,
      message: "Removal forgotten — that feed isn't in the stock registry, so add it manually.",
    };
  }

  await db
    .insert(sources)
    .values({
      slug: def.slug,
      name: def.name,
      url: def.url,
      feedUrl: def.feedUrl,
      kind: def.kind,
      category: def.category,
      baseCredibility: def.baseCredibility,
      orgSlug: def.orgSlug,
      pollMinutes: def.pollMinutes ?? 30,
      meta: def.meta,
    })
    .onConflictDoNothing();

  revalidateAll();
  return { ok: true, message: `Restored ${def.name} — it will fill on the next poll` };
}

// ---------------------------------------------------------------------------
// Add
// ---------------------------------------------------------------------------

const addSchema = z.object({
  name: z.string().trim().min(1).max(120),
  feedUrl: z.string().trim().url().max(1000),
  kind: z.enum(SOURCE_KINDS).optional(),
  category: z.enum(SOURCE_CATEGORIES).default("press"),
  baseCredibility: z.coerce.number().int().min(1).max(5).default(3),
  pollMinutes: z.coerce.number().int().min(5).max(1440).default(30),
  orgSlug: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .refine((v) => v === null || ORG_SLUGS.includes(v), "unknown company")
    .nullable()
    .default(null),
});

/**
 * Add a custom feed, but only after it has been fetched and parsed. A feed
 * that returns nothing is rejected rather than saved in a broken state.
 */
export async function addSource(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const denied = await denyNonAdmin();
  if (denied) return denied;
  const raw = Object.fromEntries(formData);
  const parsed = addSchema.safeParse({
    ...raw,
    // An empty select means "auto-detect".
    kind: raw.kind === "" ? undefined : raw.kind,
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const input = parsed.data;

  const existing = await db
    .select({ slug: sources.slug, feedUrl: sources.feedUrl })
    .from(sources);

  if (existing.some((s) => s.feedUrl === input.feedUrl)) {
    return { ok: false, message: "That feed URL is already in the list" };
  }

  const probe = await probeFeed(input.feedUrl, input.kind);
  if (!probe.ok) {
    return { ok: false, message: probe.error ?? "Feed could not be read" };
  }

  const slug = uniqueSlug(
    slugify(input.name),
    new Set(existing.map((s) => s.slug)),
  );

  await db.insert(sources).values({
    slug,
    name: input.name,
    feedUrl: input.feedUrl,
    url: originOf(input.feedUrl),
    kind: probe.kind,
    category: input.category,
    baseCredibility: input.baseCredibility,
    pollMinutes: input.pollMinutes,
    orgSlug: input.orgSlug,
    meta: { managedBy: "user" },
  });

  revalidateAll();
  return {
    ok: true,
    message: `Added ${input.name} — ${probe.itemCount} items found, e.g. “${truncate(probe.sampleTitle ?? "", 60)}”`,
  };
}

/** Check a feed without saving it, so the form can report before committing. */
export async function testFeed(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const denied = await denyNonAdmin();
  if (denied) return denied;
  const feedUrl = String(formData.get("feedUrl") ?? "").trim();
  if (!feedUrl) return { ok: false, message: "Enter a feed URL first" };

  const probe = await probeFeed(feedUrl);
  return probe.ok
    ? {
        ok: true,
        message: `${probe.kind} · ${probe.itemCount} items · newest “${truncate(probe.sampleTitle ?? "", 60)}”`,
      }
    : { ok: false, message: probe.error ?? "Feed could not be read" };
}

function originOf(feedUrl: string): string | null {
  try {
    return new URL(feedUrl).origin;
  } catch {
    return null;
  }
}

function truncate(text: string, limit: number): string {
  return text.length <= limit ? text : `${text.slice(0, limit)}…`;
}
