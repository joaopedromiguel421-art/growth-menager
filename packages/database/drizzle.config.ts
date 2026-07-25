import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  out: "../../supabase/migrations",
  schema: "./src/schema.ts",
  schemaFilter: ["app"],
  dbCredentials: {
    url:
      process.env.DATABASE_MIGRATOR_URL ?? "postgresql://postgres:postgres@localhost:54322/postgres"
  },
  strict: true,
  verbose: true
});
