import { z } from "zod";
import { isoDateTimeSchema } from "./common.js";
import { approvalSchema, recommendationSchema, taskSchema } from "./work.js";

export const sourceHealthSchema = z
  .object({
    provider: z.enum(["google_business", "search_console", "ga4", "instagram", "dataforseo"]),
    status: z.enum(["healthy", "degraded", "stale", "disconnected"]),
    last_synced_at: isoDateTimeSchema.nullable(),
    freshness_label: z.string()
  })
  .strict();

export const dashboardSchema = z
  .object({
    generated_at: isoDateTimeSchema,
    data_quality: z.enum(["complete", "partial", "insufficient"]),
    recommendations: z.array(recommendationSchema),
    tasks: z.array(taskSchema),
    approvals: z.array(approvalSchema),
    sources: z.array(sourceHealthSchema),
    alerts_open: z.number().int().nonnegative(),
    monthly_cost: z.object({
      amount: z.number().nonnegative(),
      currency: z.string().length(3),
      budget_percent: z.number().min(0)
    })
  })
  .strict();

export type Dashboard = z.infer<typeof dashboardSchema>;
