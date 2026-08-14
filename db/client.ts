import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

declare global {
  // eslint-disable-next-line no-var
  var __latentfeed_sql: ReturnType<typeof postgres> | undefined;
}

// Next.js dev reloads the module graph on every edit; without this the pool
// count climbs until Postgres refuses connections.
const client =
  globalThis.__latentfeed_sql ??
  postgres(env.databaseUrl, { max: 10, prepare: false });

if (process.env.NODE_ENV !== "production") {
  globalThis.__latentfeed_sql = client;
}

export const db = drizzle(client, { schema });
export { client as sql, schema };
