import { z } from "zod";
import { isoDateTimeSchema, tenantIdSchema, uuidSchema } from "./common.js";

export const jobTypeSchema = z.enum([
  "sync",
  "classify_review",
  "draft_reply",
  "publish_reply",
  "generate_content",
  "publish_content",
  "close_period",
  "render_report",
  "deliver_report",
  "reconcile",
  "notify",
  "export_tenant",
  "delete_tenant",
  "archive_audit",
  "seo_analysis_plan",
  "seo_capability_execute",
  "seo_analysis_aggregate",
  "seo_baseline_compare",
  "seo_report_render"
]);

export const jobEnvelopeSchema = z
  .object({
    id: uuidSchema,
    schema_version: z.literal("1"),
    job_type: jobTypeSchema,
    tenant_id: tenantIdSchema,
    idempotency_key: z.string().min(8).max(160),
    trace_id: z.string().min(8).max(128),
    attempt: z.number().int().min(0).max(5),
    enqueued_at: isoDateTimeSchema,
    cursor: z.record(z.string(), z.unknown()).nullable(),
    payload: z.record(z.string(), z.unknown())
  })
  .strict();

export type JobEnvelope = z.infer<typeof jobEnvelopeSchema>;
export type JobType = z.infer<typeof jobTypeSchema>;
