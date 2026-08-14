import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { env } from "@/lib/env";

// A dedicated single connection: migrations must not share the app pool.
// onnotice is silenced because every IF NOT EXISTS in the migration emits one.
const client = postgres(env.databaseUrl, { max: 1, onnotice: () => {} });

async function main() {
  // pgvector must exist before the migration creates the embedding column.
  await client`CREATE EXTENSION IF NOT EXISTS vector`;
  await migrate(drizzle(client), { migrationsFolder: "./db/drizzle" });
  console.log("migrations applied");
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
