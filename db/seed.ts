import { sql } from "drizzle-orm";
import { db, sql as client } from "./client";
import { orgs, readerState, retiredSources, sources } from "./schema";
import { ALL_ORGS } from "@/lib/orgs";
import { SOURCE_REGISTRY } from "@/lib/sources/registry";

/**
 * Idempotent seed: upserts orgs and the stock feed list by primary key/slug.
 *
 * Rows a user has edited in the UI carry meta.managedBy = 'user'; their
 * editable fields are left alone so a re-seed never stomps manual changes.
 */
async function main() {
  for (const org of ALL_ORGS) {
    await db
      .insert(orgs)
      .values({
        slug: org.slug,
        name: org.name,
        aliases: org.aliases,
        kind: org.kind,
        domains: org.domains,
        accent: org.accent,
        sortOrder: org.sortOrder,
      })
      .onConflictDoUpdate({
        target: orgs.slug,
        set: {
          name: sql`excluded.name`,
          aliases: sql`excluded.aliases`,
          kind: sql`excluded.kind`,
          domains: sql`excluded.domains`,
          accent: sql`excluded.accent`,
          sortOrder: sql`excluded.sort_order`,
        },
      });
  }
  console.log(`seeded ${ALL_ORGS.length} orgs`);

  // The reader-state row must exist: `touchLastSeen` is an UPDATE, so without
  // it dismissing the "new since last visit" count would silently do nothing
  // on a fresh install.
  await db.insert(readerState).values({ id: 1 }).onConflictDoNothing();

  // Feeds the user removed stay removed. The registry says what a fresh
  // install gets, not what this install must have.
  const retired = new Set(
    (await db.select({ slug: retiredSources.slug }).from(retiredSources)).map(
      (r) => r.slug,
    ),
  );

  let skipped = 0;

  for (const def of SOURCE_REGISTRY) {
    if (retired.has(def.slug)) {
      skipped++;
      continue;
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
      .onConflictDoUpdate({
        target: sources.slug,
        set: {
          name: sql`case when ${sources.meta}->>'managedBy' = 'user'
                      then ${sources.name} else excluded.name end`,
          feedUrl: sql`case when ${sources.meta}->>'managedBy' = 'user'
                         then ${sources.feedUrl} else excluded.feed_url end`,
          url: sql`case when ${sources.meta}->>'managedBy' = 'user'
                     then ${sources.url} else excluded.url end`,
          kind: sql`excluded.kind`,
          category: sql`excluded.category`,
          baseCredibility: sql`case when ${sources.meta}->>'managedBy' = 'user'
                                 then ${sources.baseCredibility}
                                 else excluded.base_credibility end`,
          orgSlug: sql`excluded.org_slug`,
          pollMinutes: sql`excluded.poll_minutes`,
        },
      });
  }
  console.log(
    `seeded ${SOURCE_REGISTRY.length - skipped} sources` +
      (skipped > 0 ? ` · skipped ${skipped} you removed` : ""),
  );

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
