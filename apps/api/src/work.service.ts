import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, sql } from "drizzle-orm";
import type {
  Approval,
  ApprovalDecision,
  Recommendation,
  RecommendationDecision,
  Task,
  TaskCreate,
  TaskUpdate
} from "@growth-manager/contracts";
import { schema, type Database, type DatabaseClient } from "@growth-manager/database";
import { DomainError, newId, requirePermission, type TenantContext } from "@growth-manager/domain";
import { DATABASE } from "./database.provider.js";

@Injectable()
export class WorkService {
  public constructor(@Inject(DATABASE) private readonly client: DatabaseClient) {}

  public listRecommendations(context: TenantContext): Promise<readonly Recommendation[]> {
    requirePermission(context, "recommendations.read");
    return this.client.withTenant(context, async (database) => {
      const records = await database
        .select()
        .from(schema.recommendations)
        .where(eq(schema.recommendations.tenantId, context.tenantId))
        .orderBy(desc(schema.recommendations.priorityScore))
        .limit(100);
      return records.map(toRecommendation);
    });
  }

  public decideRecommendation(
    context: TenantContext,
    recommendationId: string,
    idempotencyKey: string,
    decision: RecommendationDecision
  ): Promise<unknown> {
    requirePermission(context, "recommendations.decide");
    return this.client.withTenant(context, async (database) => {
      const records = await database.execute(sql`
        update app.recommendations
        set status = ${decision.decision},
            accepted_at = case when ${decision.decision} = 'accepted' then now() else null end,
            dismissed_at = case when ${decision.decision} = 'dismissed' then now() else null end,
            dismissal_reason = ${decision.reason ?? null},
            updated_at = now(),
            version = version + 1
        where id = ${recommendationId}
          and tenant_id = ${context.tenantId}
          and status = 'open'
        returning *
      `);
      const recommendation = records[0];
      if (recommendation === undefined) {
        throw new DomainError(
          "GM-RECOMMENDATION-CONFLICT",
          "Recomendação já decidida ou inexistente.",
          false
        );
      }

      if (decision.decision === "accepted" && decision.create_task) {
        await this.insertTask(database, context, {
          recommendation_id: recommendationId,
          title: String(recommendation.title),
          description: String(recommendation.description),
          priority: "high",
          assignee_id: null,
          due_at: null
        });
      }
      await this.outbox(database, context, idempotencyKey, "recommendation_decided", {
        recommendation_id: recommendationId,
        decision: decision.decision
      });
      return {
        id: recommendation.id,
        tenant_id: recommendation.tenant_id,
        status: recommendation.status,
        version: recommendation.version
      };
    });
  }

  public listTasks(context: TenantContext): Promise<readonly Task[]> {
    requirePermission(context, "tasks.read");
    return this.client.withTenant(context, async (database) => {
      const records = await database
        .select()
        .from(schema.tasks)
        .where(eq(schema.tasks.tenantId, context.tenantId))
        .orderBy(schema.tasks.dueAt)
        .limit(200);
      return records.map(toTask);
    });
  }

  public createTask(
    context: TenantContext,
    idempotencyKey: string,
    input: TaskCreate
  ): Promise<unknown> {
    requirePermission(context, "tasks.write");
    return this.client.withTenant(context, async (database) => {
      const task = await this.insertTask(database, context, input);
      await this.outbox(database, context, idempotencyKey, "task_created", {
        task_id: task.id
      });
      return toTask(task);
    });
  }

  public updateTask(
    context: TenantContext,
    taskId: string,
    idempotencyKey: string,
    input: TaskUpdate
  ): Promise<unknown> {
    requirePermission(context, "tasks.write");
    return this.client.withTenant(context, async (database) => {
      const records = await database.execute(sql`
        update app.tasks
        set title = coalesce(${input.title ?? null}, title),
            description = case
              when ${input.description === undefined} then description
              else ${input.description ?? null}
            end,
            status = coalesce(${input.status ?? null}, status),
            priority = coalesce(${input.priority ?? null}, priority),
            assignee_id = case
              when ${input.assignee_id === undefined} then assignee_id
              else ${input.assignee_id ?? null}::uuid
            end,
            due_at = case
              when ${input.due_at === undefined} then due_at
              else ${input.due_at ?? null}::timestamptz
            end,
            completed_at = case
              when ${input.status ?? null} = 'done' then now()
              when ${input.status ?? null} is not null then null
              else completed_at
            end,
            updated_at = now(),
            version = version + 1
        where id = ${taskId}
          and tenant_id = ${context.tenantId}
          and version = ${input.version}
        returning *
      `);
      const task = records[0];
      if (task === undefined) {
        throw new DomainError(
          "GM-TASK-VERSION-CONFLICT",
          "A tarefa foi alterada por outra pessoa.",
          false
        );
      }
      await this.outbox(database, context, idempotencyKey, "task_updated", {
        task_id: taskId,
        version: input.version + 1
      });
      return {
        id: task.id,
        tenant_id: task.tenant_id,
        status: task.status,
        version: task.version
      };
    });
  }

  public listApprovals(context: TenantContext): Promise<readonly Approval[]> {
    requirePermission(context, "approvals.read");
    return this.client.withTenant(context, async (database) => {
      const records = await database
        .select()
        .from(schema.approvals)
        .where(eq(schema.approvals.tenantId, context.tenantId))
        .orderBy(schema.approvals.dueAt)
        .limit(100);
      return records.map(toApproval);
    });
  }

  public decideApproval(
    context: TenantContext,
    approvalId: string,
    idempotencyKey: string,
    decision: ApprovalDecision
  ): Promise<unknown> {
    requirePermission(context, "approvals.decide");
    return this.client.withTenant(context, async (database) => {
      const records = await database
        .update(schema.approvals)
        .set({
          status: decision.decision,
          decisionNote: decision.note,
          decidedBy: context.userId,
          decidedAt: new Date(),
          updatedAt: new Date(),
          version: sql`${schema.approvals.version} + 1`
        })
        .where(
          and(
            eq(schema.approvals.id, approvalId),
            eq(schema.approvals.tenantId, context.tenantId),
            eq(schema.approvals.status, "pending"),
            eq(schema.approvals.subjectVersion, decision.subject_version)
          )
        )
        .returning();
      const approval = records[0];
      if (approval === undefined) {
        throw new DomainError(
          "GM-APPROVAL-VERSION-CONFLICT",
          "A aprovação expirou ou a versão do conteúdo mudou.",
          false
        );
      }
      await this.outbox(database, context, idempotencyKey, "approval_decided", {
        approval_id: approvalId,
        decision: decision.decision,
        subject_version: decision.subject_version
      });
      return toApproval(approval);
    });
  }

  private async insertTask(
    database: Database,
    context: TenantContext,
    input: TaskCreate
  ): Promise<typeof schema.tasks.$inferSelect> {
    const records = await database
      .insert(schema.tasks)
      .values({
        id: newId(),
        tenantId: context.tenantId,
        recommendationId: input.recommendation_id,
        title: input.title,
        description: input.description,
        priority: input.priority,
        assigneeId: input.assignee_id,
        dueAt: input.due_at === null ? null : new Date(input.due_at),
        status: "backlog",
        source: input.recommendation_id === null ? "manual" : "recommendation"
      })
      .returning();
    const task = records[0];
    if (task === undefined) {
      throw new DomainError("GM-TASK-CREATE", "Não foi possível criar a tarefa.", true);
    }
    return task;
  }

  private async outbox(
    database: Database,
    context: TenantContext,
    idempotencyKey: string,
    eventType: string,
    payload: Readonly<Record<string, unknown>>
  ): Promise<void> {
    await database.insert(schema.outboxEvents).values({
      id: newId(),
      tenantId: context.tenantId,
      aggregateType: eventType.split("_")[0] ?? "domain",
      aggregateId: newId(),
      eventType,
      schemaVersion: "1",
      idempotencyKey,
      payload,
      traceId: context.traceId
    });
  }
}

function toRecommendation(item: typeof schema.recommendations.$inferSelect): Recommendation {
  return {
    id: item.id,
    tenant_id: item.tenantId,
    title: item.title,
    description: item.description,
    category: item.category,
    status: item.status as Recommendation["status"],
    priority_score: item.priorityScore,
    risk: item.risk as Recommendation["risk"],
    confidence: Number(item.confidence),
    rationale: item.rationale,
    created_at: item.createdAt.toISOString()
  };
}

function toTask(item: typeof schema.tasks.$inferSelect): Task {
  return {
    id: item.id,
    tenant_id: item.tenantId,
    recommendation_id: item.recommendationId,
    title: item.title,
    description: item.description,
    status: item.status as Task["status"],
    priority: item.priority as Task["priority"],
    assignee_id: item.assigneeId,
    due_at: item.dueAt?.toISOString() ?? null
  };
}

function toApproval(item: typeof schema.approvals.$inferSelect): Approval {
  return {
    id: item.id,
    tenant_id: item.tenantId,
    subject_type: item.subjectType as Approval["subject_type"],
    subject_id: item.subjectId,
    subject_version: item.subjectVersion,
    risk: item.risk as Approval["risk"],
    status: item.status as Approval["status"],
    requested_by: item.requestedBy,
    assigned_to: item.assignedTo,
    due_at: item.dueAt?.toISOString() ?? null
  };
}
