import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

declare global {
  // eslint-disable-next-line no-var
  var __latentfeed_sql: ReturnType<typeof postgres> | undefined;
}

/**
 * Serverless opens a fresh module instance per invocation, so a large pool per
 * instance exhausts the database's connection limit under any real traffic.
 * One connection each, fanned out by the provider's pooler, is the right shape
 * there; locally a small pool is faster for the worker's sequential queries.
 *
 * Use the *pooled* connection string on Neon (`...-pooler...`).
 */
const isServerless = Boolean(process.env.VERCEL);

// Next.js dev reloads the module graph on every edit; without this the pool
// count climbs until Postgres refuses connections.
const client =
  globalThis.__latentfeed_sql ??
  postgres(env.databaseUrl, {
    max: isServerless ? 1 : 10,
    prepare: false,
    // Neon requires TLS; local Postgres has none configured.
    ssl: env.databaseUrl.includes("neon.tech") ? "require" : undefined,
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__latentfeed_sql = client;
}

export const db = drizzle(client, { schema });
export { client as sql, schema };
