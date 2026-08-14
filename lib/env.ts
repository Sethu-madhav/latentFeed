/**
 * Loads .env for the non-Next.js entrypoints (worker, drizzle-kit, seed, CLI).
 * Next.js loads .env itself, so importing this from web code is a harmless no-op.
 */
import { config } from "dotenv";

config({ path: ".env", quiet: true });

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required env var ${name}. Copy .env.example to .env and fill it in.`,
    );
  }
  return value;
}

export const env = {
  get databaseUrl() {
    return required("DATABASE_URL");
  },
  userAgent:
    process.env.INGEST_USER_AGENT ??
    "latentFeed/0.1 (+https://github.com/latentfeed)",
  pollCron: process.env.POLL_CRON ?? "*/30 * * * *",
  workerPort: Number(process.env.WORKER_PORT ?? 8788),
  disableIngest: process.env.DISABLE_INGEST === "1",
};
