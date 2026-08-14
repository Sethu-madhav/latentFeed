import { defineConfig } from "drizzle-kit";
import "./lib/env";

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./db/drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  strict: true,
  verbose: true,
});
