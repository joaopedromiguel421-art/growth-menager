import { Inject, Injectable } from "@nestjs/common";
import type { Dashboard } from "@growth-manager/contracts";
import { sql, type DatabaseClient } from "@growth-manager/database";
import { requirePermission, type TenantContext } from "@growth-manager/domain";
import { DATABASE } from "./database.provider.js";
import { DashboardCacheService } from "./dashboard-cache.service.js";

type SourceHealth = Dashboard["sources"][number];

const DEGRADED_AFTER_MS = 24 * 60 * 60 * 1000;
const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

interface SourceRow {
  readonly provider: SourceHealth["provider"];
  readonly connection_status: string;
  readonly last_synced_at: string | null;
}

interface DashboardAggregateRow extends Record<string, unknown> {
  readonly recommendations: Dashboard["recommendations"];
  readonly tasks: Dashboard["tasks"];
  readonly approvals: Dashboard["approvals"];
  readonly sources: readonly SourceRow[];
  readonly alerts_open: number;
  readonly cost_amount: string;
  readonly cost_currency: string | null;
  readonly budget_limit: string;
}

@Injectable()
export class DashboardService {
  public constructor(
    @Inject(DATABASE) private readonly client: DatabaseClient,
    private readonly cache: DashboardCacheService
  ) {}

  public async get(context: TenantContext): Promise<Dashboard> {
    requirePermission(context, "tenant.read");
    const cached = this.cache.get(context.tenantId);
    if (cached !== undefined) return cached;

    const dashboard = await this.client.withTenant(context, async (database) => {
      const rows = await database.execute<DashboardAggregateRow>(sql`
        select
          coalesce((
            select jsonb_agg(to_jsonb(recommendation_row))
            from (
              select id, tenant_id, title, description, category, status,
                     priority_score, risk, confidence::double precision as confidence,
                     rationale, created_at
              from app.recommendations
              where tenant_id = ${context.tenantId}::uuid and status = 'open'
              order by priority_score desc
              limit 5
            ) recommendation_row
          ), '[]'::jsonb) as recommendations,
          coalesce((
            select jsonb_agg(to_jsonb(task_row))
            from (
              select id, tenant_id, recommendation_id, title, description, status,
                     priority, assignee_id, due_at, version
              from app.tasks
              where tenant_id = ${context.tenantId}::uuid and completed_at is null
              order by due_at nulls last
              limit 5
            ) task_row
          ), '[]'::jsonb) as tasks,
          coalesce((
            select jsonb_agg(to_jsonb(approval_row))
            from (
              select id, tenant_id, subject_type, subject_id, subject_version, risk,
                     status, requested_by, assigned_to, due_at
              from app.approvals
              where tenant_id = ${context.tenantId}::uuid and status = 'pending'
              order by due_at nulls last
              limit 5
            ) approval_row
          ), '[]'::jsonb) as approvals,
          coalesce((
            select jsonb_agg(to_jsonb(source_row))
            from (
              select provider, status as connection_status, last_synced_at
              from app.integration_connections
              where tenant_id = ${context.tenantId}::uuid and provider <> 'deepseek'
            ) source_row
          ), '[]'::jsonb) as sources,
          (select count(*)::int
             from app.alerts
            where tenant_id = ${context.tenantId}::uuid
              and status in ('open', 'acknowledged')) as alerts_open,
          (select coalesce(sum(cost), 0)::text
             from app.usage_events
            where tenant_id = ${context.tenantId}::uuid
              and occurred_at >= date_trunc('month', now())) as cost_amount,
          (select min(currency)
             from app.usage_events
            where tenant_id = ${context.tenantId}::uuid
              and occurred_at >= date_trunc('month', now())) as cost_currency,
          (select coalesce(sum(soft_limit), 0)::text
             from app.budgets
            where tenant_id = ${context.tenantId}::uuid and period = 'monthly') as budget_limit
      `);
      const row = rows[0];
      if (row === undefined) throw new Error("Dashboard aggregate returned no row.");
      return toDashboard(row);
    });

    this.cache.set(context.tenantId, dashboard);
    return dashboard;
  }
}

function toDashboard(row: DashboardAggregateRow): Dashboard {
  const sources = row.sources.map((source) => {
    const lastSyncedAt = source.last_synced_at === null ? null : new Date(source.last_synced_at);
    return {
      provider: source.provider,
      status: sourceStatus(source.connection_status, lastSyncedAt),
      last_synced_at: lastSyncedAt?.toISOString() ?? null,
      freshness_label: freshnessLabel(lastSyncedAt)
    };
  });
  const amount = Number(row.cost_amount);
  const limit = Number(row.budget_limit);

  return {
    generated_at: new Date().toISOString(),
    data_quality: dataQuality(sources),
    recommendations: row.recommendations,
    tasks: row.tasks,
    approvals: row.approvals,
    sources,
    alerts_open: row.alerts_open,
    monthly_cost: {
      amount,
      currency: row.cost_currency ?? "USD",
      budget_percent: limit > 0 ? Math.round((amount / limit) * 100) : 0
    }
  };
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
  const minutes = Math.floor((Date.now() - lastSyncedAt.getTime()) / 60_000);
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
