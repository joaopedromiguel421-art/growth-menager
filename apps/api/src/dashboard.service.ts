import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import type { Dashboard } from "@growth-manager/contracts";
import { schema, type Database, type DatabaseClient } from "@growth-manager/database";
import { requirePermission, type TenantContext } from "@growth-manager/domain";
import { DATABASE } from "./database.provider.js";

type SourceHealth = Dashboard["sources"][number];

// A source the dashboard trusts must have synced within a day; a week without a
// sync is treated as stale rather than merely late.
const DEGRADED_AFTER_MS = 24 * 60 * 60 * 1000;
const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class DashboardService {
  public constructor(@Inject(DATABASE) private readonly client: DatabaseClient) {}

  public async get(context: TenantContext): Promise<Dashboard> {
    requirePermission(context, "tenant.read");

    return this.client.withTenant(context, async (database) => {
      const [recommendations, tasks, approvals, sources, alertsOpen, monthlyCost] =
        await Promise.all([
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
            .where(
              and(eq(schema.tasks.tenantId, context.tenantId), isNull(schema.tasks.completedAt))
            )
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
            .limit(5),
          this.sources(database, context),
          this.openAlerts(database, context),
          this.monthlyCost(database, context)
        ]);

      return {
        generated_at: new Date().toISOString(),
        data_quality: dataQuality(sources),
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
        sources,
        alerts_open: alertsOpen,
        monthly_cost: monthlyCost
      };
    });
  }

  private async sources(database: Database, context: TenantContext): Promise<SourceHealth[]> {
    const connections = await database
      .select()
      .from(schema.integrationConnections)
      .where(eq(schema.integrationConnections.tenantId, context.tenantId));

    return connections
      .filter((row) => row.provider !== "deepseek")
      .map((row) => {
        const lastSyncedAt = row.lastSyncedAt;
        return {
          provider: row.provider as SourceHealth["provider"],
          status: sourceStatus(row.status, lastSyncedAt),
          last_synced_at: lastSyncedAt?.toISOString() ?? null,
          freshness_label: freshnessLabel(lastSyncedAt)
        };
      });
  }

  private async openAlerts(database: Database, context: TenantContext): Promise<number> {
    const rows = await database
      .select({ total: sql<number>`count(*)::int` })
      .from(schema.alerts)
      .where(
        and(
          eq(schema.alerts.tenantId, context.tenantId),
          inArray(schema.alerts.status, ["open", "acknowledged"])
        )
      );
    return rows[0]?.total ?? 0;
  }

  private async monthlyCost(
    database: Database,
    context: TenantContext
  ): Promise<Dashboard["monthly_cost"]> {
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);

    const [spend] = await database
      .select({
        amount: sql<string>`coalesce(sum(${schema.usageEvents.cost}), 0)::text`,
        currency: sql<string | null>`min(${schema.usageEvents.currency})`
      })
      .from(schema.usageEvents)
      .where(
        and(
          eq(schema.usageEvents.tenantId, context.tenantId),
          gte(schema.usageEvents.occurredAt, monthStart)
        )
      );

    const [budget] = await database
      .select({ limit: sql<string>`coalesce(sum(${schema.budgets.softLimit}), 0)::text` })
      .from(schema.budgets)
      .where(
        and(eq(schema.budgets.tenantId, context.tenantId), eq(schema.budgets.period, "monthly"))
      );

    const amount = Number(spend?.amount ?? 0);
    const limit = Number(budget?.limit ?? 0);
    return {
      amount,
      currency: spend?.currency ?? "USD",
      // Without a configured budget there is no meaningful percentage to report.
      budget_percent: limit > 0 ? Math.round((amount / limit) * 100) : 0
    };
  }
}

function sourceStatus(connectionStatus: string, lastSyncedAt: Date | null): SourceHealth["status"] {
  if (connectionStatus !== "active") return "disconnected";
  if (lastSyncedAt === null) return "stale";
  const age = Date.now() - lastSyncedAt.getTime();
  if (age > STALE_AFTER_MS) return "stale";
  if (age > DEGRADED_AFTER_MS) return "degraded";
  return "healthy";
}

function freshnessLabel(lastSyncedAt: Date | null): string {
  if (lastSyncedAt === null) return "nunca sincronizado";
  const minutes = Math.floor((Date.now() - lastSyncedAt.getTime()) / 60000);
  if (minutes < 60) return `há ${String(Math.max(minutes, 1))} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${String(hours)} h`;
  return `há ${String(Math.floor(hours / 24))} d`;
}

function dataQuality(sources: readonly SourceHealth[]): Dashboard["data_quality"] {
  const healthy = sources.filter((source) => source.status === "healthy").length;
  if (healthy === 0) return "insufficient";
  return healthy === sources.length ? "complete" : "partial";
}
