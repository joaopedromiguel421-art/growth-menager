import { z } from "zod";
import { isoDateTimeSchema, tenantIdSchema, uuidSchema } from "./common.js";

export const recommendationStatusSchema = z.enum(["open", "accepted", "dismissed", "expired"]);
export const riskSchema = z.enum(["low", "medium", "high", "critical"]);

export const recommendationSchema = z
  .object({
    id: uuidSchema,
    tenant_id: tenantIdSchema,
    title: z.string().min(1).max(200),
    description: z.string(),
    category: z.string().min(1).max(40),
    status: recommendationStatusSchema,
    priority_score: z.number().int().min(0).max(100),
    risk: riskSchema,
    confidence: z.number().min(0).max(1),
    rationale: z.string(),
    created_at: isoDateTimeSchema
  })
  .strict();

export const taskSchema = z
  .object({
    id: uuidSchema,
    tenant_id: tenantIdSchema,
    recommendation_id: uuidSchema.nullable(),
    title: z.string().min(1).max(200),
    description: z.string().nullable(),
    status: z.enum(["backlog", "todo", "in_progress", "blocked", "done", "cancelled"]),
    priority: z.enum(["low", "medium", "high", "urgent"]),
    assignee_id: uuidSchema.nullable(),
    due_at: isoDateTimeSchema.nullable()
  })
  .strict();

export const approvalSchema = z
  .object({
    id: uuidSchema,
    tenant_id: tenantIdSchema,
    subject_type: z.enum(["review_reply", "content", "publication", "report"]),
    subject_id: uuidSchema,
    subject_version: z.number().int().positive(),
    risk: riskSchema,
    status: z.enum(["pending", "approved", "rejected", "cancelled", "expired"]),
    requested_by: uuidSchema,
    assigned_to: uuidSchema.nullable(),
    due_at: isoDateTimeSchema.nullable()
  })
  .strict();

export const recommendationDecisionSchema = z
  .object({
    decision: z.enum(["accepted", "dismissed"]),
    reason: z.string().trim().min(1).max(500).optional(),
    create_task: z.boolean().default(false)
  })
  .strict();

export const taskCreateSchema = z
  .object({
    recommendation_id: uuidSchema.nullable().default(null),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(5000).nullable().default(null),
    priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
    assignee_id: uuidSchema.nullable().default(null),
    due_at: isoDateTimeSchema.nullable().default(null)
  })
  .strict();

export const taskUpdateSchema = z
  .object({
    version: z.number().int().positive(),
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(5000).nullable().optional(),
    status: z.enum(["backlog", "todo", "in_progress", "blocked", "done", "cancelled"]).optional(),
    priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
    assignee_id: uuidSchema.nullable().optional(),
    due_at: isoDateTimeSchema.nullable().optional()
  })
  .strict();

export const approvalDecisionSchema = z
  .object({
    decision: z.enum(["approved", "rejected"]),
    subject_version: z.number().int().positive(),
    note: z.string().trim().max(1000).nullable().default(null)
  })
  .strict();

export type Recommendation = z.infer<typeof recommendationSchema>;
export type Task = z.infer<typeof taskSchema>;
export type Approval = z.infer<typeof approvalSchema>;
export type RecommendationDecision = z.infer<typeof recommendationDecisionSchema>;
export type TaskCreate = z.infer<typeof taskCreateSchema>;
export type TaskUpdate = z.infer<typeof taskUpdateSchema>;
export type ApprovalDecision = z.infer<typeof approvalDecisionSchema>;
