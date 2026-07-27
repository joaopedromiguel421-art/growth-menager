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
    RESEND_FROM_EMAIL: z.email().default("convites@growthmanager.com.br"),
    INTERNAL_WORKER_SECRET: z.string().min(32),
    CRON_SECRET: z.string().min(32),
    GOOGLE_CLIENT_ID: z.string().min(1).default("not-configured"),
    GOOGLE_CLIENT_SECRET: z.string().min(1).default("not-configured"),
    DATAFORSEO_LOGIN: z.string().min(1).default("not-configured"),
    DATAFORSEO_PASSWORD: z.string().min(1).default("not-configured"),
    DEEPSEEK_API_KEY: z.string().min(1).default("not-configured"),
    DEEPSEEK_BASE_URL: z.url().default("https://api.deepseek.com"),
    DEEPSEEK_FLASH_MODEL: z.string().min(1).default("deepseek-v4-flash"),
    DEEPSEEK_PRO_MODEL: z.string().min(1).default("deepseek-v4-pro"),
    FIRECRAWL_API_KEY: z.string().min(1).default("not-configured"),
    FIRECRAWL_BASE_URL: z.url().default("https://api.firecrawl.dev"),
    SENTRY_DSN: z.string().optional(),
    OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),
    FEATURE_PASSKEYS: booleanString,
    FEATURE_REAL_PROVIDERS: booleanString,
    FEATURE_SEO_MONITORING: booleanString,
    FEATURE_SEO_REAL_PROVIDERS: booleanString,
    FEATURE_SEO_DEEPSEEK: booleanString,
    FEATURE_SEO_AUTO_TASKS: booleanString
  })
  .readonly();

export type AppConfig = z.infer<typeof configSchema>;

export function parseConfig(environment: NodeJS.ProcessEnv): AppConfig {
  return configSchema.parse(environment);
}
