import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { Dashboard } from "@growth-manager/contracts";
import { schema, type DatabaseClient } from "@growth-manager/database";
import { requirePermission, type TenantContext } from "@growth-manager/domain";
import { DATABASE } from "./database.provider.js";

@Injectable()
export class DashboardService {
  public constructor(@Inject(DATABASE) private readonly client: DatabaseClient) {}

  public async get(context: TenantContext): Promise<Dashboard> {
    requirePermission(context, "tenant.read");

    return this.client.withTenant(context, async (database) => {
      const [recommendations, tasks, approvals] = await Promise.all([
        database
          .select()
          .from(schema.recommendations)
          .where(
            and(
              eq(schema.recommendations.tenantId, context.tenantId),
              eq(schema.recommendations.status, "open")
            )
          )
          .orderBy(desc(schema.recommendations.priorityScore))
          .limit(5),
        database
          .select()
          .from(schema.tasks)
          .where(and(eq(schema.tasks.tenantId, context.tenantId), isNull(schema.tasks.completedAt)))
          .orderBy(schema.tasks.dueAt)
          .limit(5),
        database
          .select()
          .from(schema.approvals)
          .where(
            and(
              eq(schema.approvals.tenantId, context.tenantId),
              eq(schema.approvals.status, "pending")
            )
          )
          .orderBy(schema.approvals.dueAt)
          .limit(5)
      ]);

      return {
        generated_at: new Date().toISOString(),
        data_quality: "insufficient",
        recommendations: recommendations.map((item) => ({
          id: item.id,
          tenant_id: item.tenantId,
          title: item.title,
          description: item.description,
          category: item.category,
          status: item.status as "open",
          priority_score: item.priorityScore,
          risk: item.risk as "low" | "medium" | "high" | "critical",
          confidence: Number(item.confidence),
          rationale: item.rationale,
          created_at: item.createdAt.toISOString()
        })),
        tasks: tasks.map((item) => ({
          id: item.id,
          tenant_id: item.tenantId,
          recommendation_id: item.recommendationId,
          title: item.title,
          description: item.description,
          status: item.status as
            | "backlog"
            | "todo"
            | "in_progress"
            | "blocked"
            | "done"
            | "cancelled",
          priority: item.priority as "low" | "medium" | "high" | "urgent",
          assignee_id: item.assigneeId,
          due_at: item.dueAt?.toISOString() ?? null,
          version: item.version
        })),
        approvals: approvals.map((item) => ({
          id: item.id,
          tenant_id: item.tenantId,
          subject_type: item.subjectType as "review_reply" | "content" | "publication" | "report",
          subject_id: item.subjectId,
          subject_version: item.subjectVersion,
          risk: item.risk as "low" | "medium" | "high" | "critical",
          status: item.status as "pending",
          requested_by: item.requestedBy,
          assigned_to: item.assignedTo,
          due_at: item.dueAt?.toISOString() ?? null
        })),
        sources: [],
        alerts_open: 0,
        monthly_cost: { amount: 0, currency: "USD", budget_percent: 0 }
      };
    });
  }
}
