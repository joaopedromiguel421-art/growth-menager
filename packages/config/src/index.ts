import { z } from "zod";

const booleanString = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const configSchema = z
  .object({
    APP_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
    APP_VERSION: z.string().min(1).default("dev"),
    PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
    API_BASE_URL: z.url().default("http://localhost:4000"),
    REPORTS_BASE_URL: z.url().default("http://localhost:3000/portal"),
    SUPABASE_URL: z.url(),
    SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
    SUPABASE_SECRET_KEY: z.string().min(1),
    SUPABASE_JWT_ISSUER: z.url(),
    DATABASE_URL: z.string().startsWith("postgres"),
    RESEND_API_KEY: z.string().min(1),
    RESEND_WEBHOOK_SECRET: z.string().min(1),
    INTERNAL_WORKER_SECRET: z.string().min(32),
    CRON_SECRET: z.string().min(32),
    SENTRY_DSN: z.string().optional(),
    OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),
    FEATURE_PASSKEYS: booleanString,
    FEATURE_REAL_PROVIDERS: booleanString
  })
  .readonly();

export type AppConfig = z.infer<typeof configSchema>;

export function parseConfig(environment: NodeJS.ProcessEnv): AppConfig {
  return configSchema.parse(environment);
}
