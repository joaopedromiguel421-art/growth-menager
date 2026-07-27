import { z } from "zod";
import { isoDateTimeSchema, tenantIdSchema, uuidSchema } from "./common.js";

const httpUrlSchema = z.url().refine((value) => {
  const protocol = new URL(value).protocol;
  return protocol === "https:" || protocol === "http:";
}, "A URL deve usar HTTP ou HTTPS.");

export const seoCapabilityCodeSchema = z.enum([
  "technical",
  "content",
  "schema",
  "sitemap",
  "performance",
  "visual",
  "google",
  "local",
  "maps",
  "competitor",
  "backlink",
  "ai_visibility",
  "sxo",
  "drift"
]);

export const seoCoreCapabilityCodes = [
  "technical",
  "content",
  "schema",
  "sitemap"
] as const satisfies readonly z.infer<typeof seoCapabilityCodeSchema>[];

export const seoFindingCategorySchema = z.enum([
  "technical",
  "content",
  "schema",
  "performance",
  "google_business",
  "local",
  "maps",
  "competitor",
  "backlink",
  "ai_visibility",
  "sxo"
]);

export const seoFindingSeveritySchema = z.enum(["critical", "high", "medium", "low", "info"]);
export const seoFindingStatusSchema = z.enum([
  "open",
  "acknowledged",
  "accepted",
  "in_progress",
  "resolved",
  "dismissed",
  "regressed",
  "superseded",
  "insufficient_evidence"
]);
export const seoObservationKindSchema = z.enum(["observed", "derived", "estimated", "inferred"]);
export const seoSkipReasonSchema = z.enum([
  "not_applicable",
  "missing_integration",
  "missing_baseline",
  "stale_input",
  "cost_limit",
  "permission",
  "provider_unavailable",
  "unsupported"
]);
export const seoAnalysisRunStatusSchema = z.enum([
  "queued",
  "planning",
  "running",
  "partial",
  "succeeded",
  "failed",
  "cancelled",
  "cost_blocked"
]);
export const seoAnalysisModeSchema = z.enum(["baseline", "periodic", "on_demand", "post_deploy"]);
export const seoCapabilityRunStatusSchema = z.enum([
  "queued",
  "running",
  "skipped",
  "succeeded",
  "failed",
  "cost_blocked"
]);

export const seoConfidenceSchema = z
  .object({
    score: z.number().min(0).max(1),
    coverage: z.number().min(0).max(1),
    freshness: z.number().min(0).max(1),
    agreement: z.number().min(0).max(1)
  })
  .strict();

export const seoFindingOriginSchema = z
  .object({
    capability_code: seoCapabilityCodeSchema,
    source: z.string().min(1).max(64),
    provider: z.string().min(1).max(64).nullable(),
    rule_version: z.string().min(1).max(64),
    prompt_version: z.string().min(1).max(64).nullable(),
    captured_at: isoDateTimeSchema
  })
  .strict();

export const seoFindingImpactSchema = z
  .object({
    band: z.enum(["high", "medium", "low", "unknown"]),
    affected_scope: z.string().min(1).max(500),
    metric_keys: z.array(z.string().min(1).max(80)).max(50)
  })
  .strict();

export const seoFindingSchema = z
  .object({
    id: uuidSchema,
    tenant_id: tenantIdSchema,
    target_id: uuidSchema,
    analysis_run_id: uuidSchema,
    code: z
      .string()
      .regex(/^SEO-[A-Z0-9]+(?:-[A-Z0-9]+)+$/)
      .max(96),
    category: seoFindingCategorySchema,
    severity: seoFindingSeveritySchema,
    title: z.string().min(1).max(200),
    description: z.string().min(1).max(5000),
    confidence: seoConfidenceSchema,
    evidence_ids: z.array(uuidSchema).min(1).max(100),
    origin: seoFindingOriginSchema,
    recommendation: z.string().min(1).max(5000),
    impact: seoFindingImpactSchema,
    status: seoFindingStatusSchema,
    first_seen_at: isoDateTimeSchema,
    last_seen_at: isoDateTimeSchema,
    resolved_at: isoDateTimeSchema.nullable(),
    version: z.number().int().positive()
  })
  .strict();

export const seoFindingStatusUpdateSchema = z
  .object({
    version: z.number().int().positive(),
    status: z.enum(["acknowledged", "accepted", "in_progress", "dismissed"]),
    reason: z.string().trim().min(1).max(1000).nullable().default(null),
    dismiss_until: isoDateTimeSchema.nullable().default(null)
  })
  .strict()
  .superRefine((value, context) => {
    if (value.status === "dismissed" && value.reason === null) {
      context.addIssue({ code: "custom", path: ["reason"], message: "Informe o motivo." });
    }
  });

export const seoTargetStatusSchema = z.enum(["active", "paused", "archived"]);
export const seoTargetScopeSchema = z.enum(["origin", "path"]);
export const seoTargetSchema = z
  .object({
    id: uuidSchema,
    tenant_id: tenantIdSchema,
    location_id: uuidSchema.nullable(),
    url: httpUrlSchema,
    normalized_origin: httpUrlSchema,
    scope: seoTargetScopeSchema,
    locale: z.string().min(2).max(16),
    timezone: z.string().min(1).max(64),
    status: seoTargetStatusSchema,
    version: z.number().int().positive(),
    created_at: isoDateTimeSchema,
    updated_at: isoDateTimeSchema
  })
  .strict();

const crawlPolicySchema = z
  .object({
    max_pages: z.number().int().min(1).max(500).default(100),
    max_redirects: z.number().int().min(0).max(5).default(3),
    timeout_ms: z.number().int().min(1000).max(60000).default(30000),
    concurrency: z.number().int().min(1).max(10).default(5),
    delay_ms: z.number().int().min(0).max(10000).default(1000),
    respect_robots: z.literal(true).default(true)
  })
  .strict();

export const seoTargetCreateSchema = z
  .object({
    location_id: uuidSchema.nullable().default(null),
    url: httpUrlSchema,
    scope: seoTargetScopeSchema.default("origin"),
    locale: z.string().min(2).max(16).default("pt-BR"),
    timezone: z.string().min(1).max(64).default("America/Sao_Paulo"),
    crawl_policy: crawlPolicySchema.default({
      max_pages: 100,
      max_redirects: 3,
      timeout_ms: 30000,
      concurrency: 5,
      delay_ms: 1000,
      respect_robots: true
    })
  })
  .strict();

export const seoTargetUpdateSchema = z
  .object({
    version: z.number().int().positive(),
    status: seoTargetStatusSchema.optional(),
    locale: z.string().min(2).max(16).optional(),
    timezone: z.string().min(1).max(64).optional(),
    crawl_policy: crawlPolicySchema.optional()
  })
  .strict();

const seoCadenceSchema = z
  .object({
    daily: z.boolean().default(true),
    weekly: z.boolean().default(true),
    monthly: z.boolean().default(true)
  })
  .strict();

const seoGeoGridPolicySchema = z
  .object({
    enabled: z.boolean().default(false),
    grid_size: z
      .number()
      .int()
      .min(3)
      .max(15)
      .refine((value) => value % 2 === 1, {
        message: "A grade deve ter tamanho ímpar."
      })
      .default(7),
    radius_meters: z.number().int().min(100).max(100000).default(5000)
  })
  .strict();

export const seoMonitoringProfileInputSchema = z
  .object({
    version: z.number().int().positive().optional(),
    enabled_capabilities: z.array(seoCapabilityCodeSchema).min(4).max(14),
    cadence: seoCadenceSchema.default({ daily: true, weekly: true, monthly: true }),
    critical_urls: z.array(httpUrlSchema).max(50).default([]),
    geogrid: seoGeoGridPolicySchema.default({ enabled: false, grid_size: 7, radius_meters: 5000 }),
    monthly_budget: z.number().nonnegative().max(1_000_000).nullable().default(null),
    currency: z.string().length(3).default("USD")
  })
  .strict()
  .superRefine((value, context) => {
    for (const core of seoCoreCapabilityCodes) {
      if (!value.enabled_capabilities.includes(core)) {
        context.addIssue({
          code: "custom",
          path: ["enabled_capabilities"],
          message: `A capability ${core} é obrigatória.`
        });
      }
    }
  });

export const seoMonitoringProfileSchema = seoMonitoringProfileInputSchema
  .safeExtend({
    id: uuidSchema,
    tenant_id: tenantIdSchema,
    target_id: uuidSchema,
    version: z.number().int().positive(),
    next_daily_at: isoDateTimeSchema.nullable(),
    next_weekly_at: isoDateTimeSchema.nullable(),
    next_monthly_at: isoDateTimeSchema.nullable()
  })
  .strict();

export const seoAnalysisRunRequestSchema = z
  .object({
    target_id: uuidSchema,
    mode: seoAnalysisModeSchema.default("on_demand"),
    capability_codes: z.array(seoCapabilityCodeSchema).min(1).max(14).optional()
  })
  .strict();

export const seoAnalysisRunSchema = z
  .object({
    id: uuidSchema,
    tenant_id: tenantIdSchema,
    target_id: uuidSchema,
    mode: seoAnalysisModeSchema,
    status: seoAnalysisRunStatusSchema,
    planner_version: z.string().min(1).max(64),
    config_version: z.string().min(1).max(64),
    requested_capabilities: z.array(seoCapabilityCodeSchema),
    estimated_cost: z.number().nonnegative(),
    actual_cost: z.number().nonnegative(),
    currency: z.string().length(3),
    coverage: z.number().min(0).max(1),
    started_at: isoDateTimeSchema.nullable(),
    finished_at: isoDateTimeSchema.nullable(),
    report_html_key: z.string().min(1).max(512).nullable(),
    report_pdf_key: z.string().min(1).max(512).nullable(),
    created_at: isoDateTimeSchema
  })
  .strict();

export const seoEvidenceSummarySchema = z
  .object({
    id: uuidSchema,
    source: z.string().min(1).max(64),
    source_ref: z.string().min(1).max(512),
    captured_at: isoDateTimeSchema,
    title: z.string().min(1).max(255),
    excerpt: z.string().nullable(),
    facts: z.record(z.string(), z.unknown()),
    sha256: z.string().length(64),
    fresh_until: isoDateTimeSchema.nullable()
  })
  .strict();

export const seoBaselineSchema = z
  .object({
    id: uuidSchema,
    tenant_id: tenantIdSchema,
    target_id: uuidSchema,
    analysis_run_id: uuidSchema,
    status: z.enum(["provisional", "active", "superseded"]),
    coverage: z.number().min(0).max(1),
    established_at: isoDateTimeSchema,
    superseded_at: isoDateTimeSchema.nullable()
  })
  .strict();

export type SeoCapabilityCode = z.infer<typeof seoCapabilityCodeSchema>;
export type SeoFindingCategory = z.infer<typeof seoFindingCategorySchema>;
export type SeoFindingSeverity = z.infer<typeof seoFindingSeveritySchema>;
export type SeoFindingStatus = z.infer<typeof seoFindingStatusSchema>;
export type SeoFinding = z.infer<typeof seoFindingSchema>;
export type SeoFindingStatusUpdate = z.infer<typeof seoFindingStatusUpdateSchema>;
export type SeoTarget = z.infer<typeof seoTargetSchema>;
export type SeoTargetCreate = z.infer<typeof seoTargetCreateSchema>;
export type SeoTargetUpdate = z.infer<typeof seoTargetUpdateSchema>;
export type SeoMonitoringProfile = z.infer<typeof seoMonitoringProfileSchema>;
export type SeoMonitoringProfileInput = z.infer<typeof seoMonitoringProfileInputSchema>;
export type SeoAnalysisMode = z.infer<typeof seoAnalysisModeSchema>;
export type SeoAnalysisRun = z.infer<typeof seoAnalysisRunSchema>;
export type SeoAnalysisRunRequest = z.infer<typeof seoAnalysisRunRequestSchema>;
export type SeoSkipReason = z.infer<typeof seoSkipReasonSchema>;
export type SeoEvidenceSummary = z.infer<typeof seoEvidenceSummarySchema>;
export type SeoBaseline = z.infer<typeof seoBaselineSchema>;
