import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const defaults = {
  APP_ENV: "production",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "openapi-build",
  SUPABASE_SECRET_KEY: "openapi-build",
  SUPABASE_JWT_ISSUER: "https://example.supabase.co/auth/v1",
  DATABASE_URL: "postgres://openapi:openapi@localhost:5432/openapi",
  RESEND_API_KEY: "openapi-build",
  RESEND_WEBHOOK_SECRET: "openapi-build",
  INTERNAL_WORKER_SECRET: "openapi-build-secret-000000000000",
  CRON_SECRET: "openapi-build-secret-000000000000"
};

for (const [key, value] of Object.entries(defaults)) {
  process.env[key] ??= value;
}

const [{ createApplication }, { createOpenApiDocument }] = await Promise.all([
  import("../dist/src/bootstrap.js"),
  import("../dist/src/openapi.js")
]);

const application = await createApplication();
const document = createOpenApiDocument(application);
const publicDirectory = path.resolve("public");
await mkdir(publicDirectory, { recursive: true });
await writeFile(path.join(publicDirectory, "openapi.json"), `${JSON.stringify(document)}\n`);
await application.close();
