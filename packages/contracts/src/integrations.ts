import { z } from "zod";
import { isoDateTimeSchema, tenantIdSchema, uuidSchema } from "./common.js";

export const providerSchema = z.enum([
  "google_business",
  "search_console",
  "ga4",
  "instagram",
  "dataforseo"
]);

export const connectionStatusSchema = z.enum([
  "disconnected",
  "pending_auth",
  "active",
  "degraded",
  "expired",
  "revoked"
]);

export const connectionSummarySchema = z
  .object({
    provider: providerSchema,
    status: connectionStatusSchema,
    scopes: z.array(z.string()),
    authorized_at: isoDateTimeSchema.nullable(),
    expires_at: isoDateTimeSchema.nullable(),
    last_synced_at: isoDateTimeSchema.nullable(),
    error_code: z.string().nullable(),
    selected_properties: z.number().int().nonnegative()
  })
  .strict();

export const authorizeRequestSchema = z
  .object({
    redirect_path: z
      .string()
      .regex(/^\/[\w\-/]*$/, "Informe um caminho interno começando com /")
      .max(200)
      .default("/app/connections")
  })
  .strict();

export const authorizeResponseSchema = z
  .object({
    authorization_url: z.url(),
    state_expires_at: isoDateTimeSchema
  })
  .strict();

export const integrationPropertySchema = z
  .object({
    id: uuidSchema.nullable(),
    tenant_id: tenantIdSchema,
    kind: z.string().min(1).max(40),
    external_id: z.string().min(1).max(255),
    name: z.string().min(1).max(255),
    selected: z.boolean()
  })
  .strict();

export const propertySelectionSchema = z
  .object({
    property_ids: z.array(z.string().min(1).max(255)).max(50)
  })
  .strict();

export const syncJobSchema = z
  .object({
    id: uuidSchema,
    provider: providerSchema,
    job_type: z.string().min(1).max(64),
    status: z.string().min(1).max(24),
    records_read: z.number().int().nonnegative(),
    records_written: z.number().int().nonnegative(),
    records_rejected: z.number().int().nonnegative(),
    started_at: isoDateTimeSchema.nullable(),
    finished_at: isoDateTimeSchema.nullable(),
    created_at: isoDateTimeSchema
  })
  .strict();

export type Provider = z.infer<typeof providerSchema>;
export type ConnectionStatus = z.infer<typeof connectionStatusSchema>;
export type ConnectionSummary = z.infer<typeof connectionSummarySchema>;
export type AuthorizeRequest = z.infer<typeof authorizeRequestSchema>;
export type AuthorizeResponse = z.infer<typeof authorizeResponseSchema>;
export type IntegrationProperty = z.infer<typeof integrationPropertySchema>;
export type PropertySelection = z.infer<typeof propertySelectionSchema>;
export type SyncJob = z.infer<typeof syncJobSchema>;
