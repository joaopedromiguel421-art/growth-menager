import { z } from "zod";
import { isoDateTimeSchema, tenantIdSchema, uuidSchema } from "./common.js";

const jsonRecordSchema = z.record(z.string(), z.unknown());
const dateOnlySchema = z.iso.date();

export const alertSchema = z
  .object({
    id: uuidSchema,
    tenant_id: tenantIdSchema,
    type: z.string().min(1).max(64),
    severity: z.enum(["info", "warning", "critical"]),
    status: z.enum(["open", "acknowledged", "resolved"]),
    title: z.string().min(1).max(200),
    details: jsonRecordSchema,
    occurrences: z.number().int().positive(),
    first_seen_at: isoDateTimeSchema,
    last_seen_at: isoDateTimeSchema,
    resolved_at: isoDateTimeSchema.nullable(),
    version: z.number().int().positive()
  })
  .strict();

export const alertUpdateSchema = z
  .object({
    version: z.number().int().positive(),
    status: z.enum(["acknowledged", "resolved"])
  })
  .strict();

export const budgetSchema = z
  .object({
    id: uuidSchema,
    tenant_id: tenantIdSchema,
    provider: z.string().min(1).max(32),
    period: z.literal("monthly"),
    soft_limit: z.number().nonnegative(),
    hard_limit: z.number().positive(),
    currency: z.string().length(3),
    essential_override: z.boolean(),
    effective_from: dateOnlySchema,
    version: z.number().int().positive()
  })
  .strict();

export const budgetUpsertSchema = z
  .object({
    provider: z.string().trim().min(1).max(32),
    soft_limit: z.number().nonnegative(),
    hard_limit: z.number().positive(),
    currency: z
      .string()
      .trim()
      .length(3)
      .transform((value) => value.toUpperCase()),
    essential_override: z.boolean().default(false),
    effective_from: dateOnlySchema
  })
  .strict()
  .refine((value) => value.hard_limit >= value.soft_limit, {
    message: "O limite rígido deve ser maior ou igual ao limite de aviso.",
    path: ["hard_limit"]
  });

export const costSummarySchema = z
  .object({
    period_start: dateOnlySchema,
    period_end: dateOnlySchema,
    currency: z.string().length(3),
    total: z.number().nonnegative(),
    by_provider: z.array(
      z
        .object({
          provider: z.string(),
          cost: z.number().nonnegative(),
          quantity: z.number().nonnegative()
        })
        .strict()
    ),
    budgets: z.array(budgetSchema)
  })
  .strict();

export const brandKitSchema = z
  .object({
    id: uuidSchema,
    tenant_id: tenantIdSchema,
    name: z.string().min(1).max(160),
    voice: z.string().min(1).max(5000),
    audiences: z.array(z.string().min(1).max(160)),
    allowed_claims: z.array(z.string().min(1).max(500)),
    forbidden_claims: z.array(z.string().min(1).max(500)),
    visual_tokens: jsonRecordSchema,
    is_active: z.boolean(),
    version: z.number().int().positive()
  })
  .strict();

export const brandKitUpsertSchema = z
  .object({
    version: z.number().int().positive().optional(),
    name: z.string().trim().min(1).max(160),
    voice: z.string().trim().min(1).max(5000),
    audiences: z.array(z.string().trim().min(1).max(160)).max(30),
    allowed_claims: z.array(z.string().trim().min(1).max(500)).max(100),
    forbidden_claims: z.array(z.string().trim().min(1).max(500)).max(100),
    visual_tokens: jsonRecordSchema.default({})
  })
  .strict();

export const contentStatusSchema = z.enum([
  "draft",
  "review",
  "approved",
  "scheduled",
  "published",
  "cancelled"
]);

export const contentItemSchema = z
  .object({
    id: uuidSchema,
    tenant_id: tenantIdSchema,
    channel: z.enum(["instagram", "facebook", "google_business", "linkedin", "blog", "email"]),
    type: z.enum(["post", "story", "article", "email", "update"]),
    title: z.string().min(1).max(200),
    status: contentStatusSchema,
    body: z.string(),
    scheduled_at: isoDateTimeSchema.nullable(),
    timezone: z.string().min(1).max(64),
    owner_id: uuidSchema.nullable(),
    brand_kit_id: uuidSchema.nullable(),
    campaign: z.string().max(120).nullable(),
    current_version: z.number().int().positive(),
    version: z.number().int().positive(),
    updated_at: isoDateTimeSchema
  })
  .strict();

export const contentCreateSchema = z
  .object({
    channel: contentItemSchema.shape.channel,
    type: contentItemSchema.shape.type,
    title: z.string().trim().min(1).max(200),
    body: z.string().trim().min(1).max(50000),
    timezone: z.string().trim().min(1).max(64).default("America/Sao_Paulo"),
    owner_id: uuidSchema.nullable().default(null),
    brand_kit_id: uuidSchema.nullable().default(null),
    campaign: z.string().trim().max(120).nullable().default(null)
  })
  .strict();

export const contentUpdateSchema = z
  .object({
    version: z.number().int().positive(),
    title: z.string().trim().min(1).max(200).optional(),
    body: z.string().trim().min(1).max(50000).optional(),
    status: z.enum(["draft", "review", "cancelled"]).optional(),
    owner_id: uuidSchema.nullable().optional(),
    campaign: z.string().trim().max(120).nullable().optional()
  })
  .strict();

export const publicationSchema = z
  .object({
    id: uuidSchema,
    tenant_id: tenantIdSchema,
    content_item_id: uuidSchema,
    content_title: z.string().min(1).max(200),
    content_version: z.number().int().positive(),
    provider: z.string().min(1).max(32),
    property_id: uuidSchema,
    status: z.enum(["scheduled", "queued", "publishing", "published", "failed", "cancelled"]),
    scheduled_at: isoDateTimeSchema,
    external_id: z.string().nullable(),
    failure_code: z.string().nullable(),
    version: z.number().int().positive()
  })
  .strict();

export const publicationCreateSchema = z
  .object({
    content_item_id: uuidSchema,
    provider: z.string().trim().min(1).max(32),
    property_id: uuidSchema,
    scheduled_at: isoDateTimeSchema
  })
  .strict();

export const publicationUpdateSchema = z
  .object({
    version: z.number().int().positive(),
    scheduled_at: isoDateTimeSchema.optional(),
    status: z.literal("cancelled").optional()
  })
  .strict()
  .refine((value) => value.scheduled_at !== undefined || value.status !== undefined, {
    message: "Informe a nova data ou cancele a publicação."
  });

export const reportSchema = z
  .object({
    id: uuidSchema,
    tenant_id: tenantIdSchema,
    period_start: dateOnlySchema,
    period_end: dateOnlySchema,
    status: z.enum(["queued", "generating", "draft", "approved", "published", "failed"]),
    current_version: z.number().int().positive(),
    first_report: z.boolean(),
    approved_at: isoDateTimeSchema.nullable(),
    published_at: isoDateTimeSchema.nullable(),
    created_at: isoDateTimeSchema,
    version: z.number().int().positive()
  })
  .strict();

export const reportCreateSchema = z
  .object({
    period_start: dateOnlySchema,
    period_end: dateOnlySchema
  })
  .strict()
  .refine((value) => value.period_end >= value.period_start, {
    message: "O fim do período deve ser posterior ao início.",
    path: ["period_end"]
  });

export const reportArtifactSchema = z
  .object({
    html_url: z.url(),
    pdf_url: z.url().nullable(),
    expires_at: isoDateTimeSchema
  })
  .strict();

export const reportDeliveryRequestSchema = z
  .object({
    email: z.email(),
    name: z.string().trim().min(1).max(160).nullable().default(null)
  })
  .strict();

export const reportDeliverySchema = z
  .object({
    id: uuidSchema,
    tenant_id: tenantIdSchema,
    report_id: uuidSchema,
    email: z.email(),
    status: z.enum(["queued", "sending", "sent", "delivered", "opened", "bounced", "failed"]),
    attempt: z.number().int().nonnegative(),
    created_at: isoDateTimeSchema
  })
  .strict();

export type Alert = z.infer<typeof alertSchema>;
export type AlertUpdate = z.infer<typeof alertUpdateSchema>;
export type Budget = z.infer<typeof budgetSchema>;
export type BudgetUpsert = z.infer<typeof budgetUpsertSchema>;
export type CostSummary = z.infer<typeof costSummarySchema>;
export type BrandKit = z.infer<typeof brandKitSchema>;
export type BrandKitUpsert = z.infer<typeof brandKitUpsertSchema>;
export type ContentItem = z.infer<typeof contentItemSchema>;
export type ContentCreate = z.infer<typeof contentCreateSchema>;
export type ContentUpdate = z.infer<typeof contentUpdateSchema>;
export type Publication = z.infer<typeof publicationSchema>;
export type PublicationCreate = z.infer<typeof publicationCreateSchema>;
export type PublicationUpdate = z.infer<typeof publicationUpdateSchema>;
export type Report = z.infer<typeof reportSchema>;
export type ReportCreate = z.infer<typeof reportCreateSchema>;
export type ReportArtifact = z.infer<typeof reportArtifactSchema>;
export type ReportDeliveryRequest = z.infer<typeof reportDeliveryRequestSchema>;
export type ReportDelivery = z.infer<typeof reportDeliverySchema>;
