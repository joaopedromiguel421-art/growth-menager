import { z } from "zod";
import { isoDateTimeSchema, tenantIdSchema, uuidSchema } from "./common.js";

export const reviewSentimentSchema = z.enum(["positive", "neutral", "negative"]);

// Shared by both reviews.reply_status (a summary of where the reply stands) and
// review_replies.status (the state of one specific version).
export const reviewReplyStateSchema = z.enum([
  "none",
  "draft",
  "awaiting_approval",
  "approved",
  "rejected",
  "published",
  "failed",
  "escalated"
]);

export const reviewSchema = z
  .object({
    id: uuidSchema,
    tenant_id: tenantIdSchema,
    provider: z.string().min(1).max(32),
    external_id: z.string().min(1).max(255),
    author_name: z.string().max(160).nullable(),
    rating: z.number().int().min(1).max(5),
    body: z.string().nullable(),
    published_at: isoDateTimeSchema,
    sentiment: reviewSentimentSchema.nullable(),
    sensitive_theme: z.boolean(),
    reply_status: reviewReplyStateSchema
  })
  .strict();

export const reviewReplySchema = z
  .object({
    id: uuidSchema,
    tenant_id: tenantIdSchema,
    review_id: uuidSchema,
    body: z.string().min(1).max(4096),
    status: reviewReplyStateSchema,
    version: z.number().int().positive(),
    published_at: isoDateTimeSchema.nullable(),
    failure_code: z.string().nullable()
  })
  .strict();

export const reviewDetailSchema = z
  .object({
    review: reviewSchema,
    replies: z.array(reviewReplySchema)
  })
  .strict();

export const reviewReplyUpdateSchema = z
  .object({
    body: z.string().trim().min(1).max(4096)
  })
  .strict();

export type ReviewSentiment = z.infer<typeof reviewSentimentSchema>;
export type Review = z.infer<typeof reviewSchema>;
export type ReviewReply = z.infer<typeof reviewReplySchema>;
export type ReviewDetail = z.infer<typeof reviewDetailSchema>;
export type ReviewReplyUpdate = z.infer<typeof reviewReplyUpdateSchema>;
