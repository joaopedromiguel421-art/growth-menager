import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { z } from "zod";
import type {
  Alert,
  AlertUpdate,
  BrandKit,
  BrandKitUpsert,
  Budget,
  BudgetUpsert,
  ContentCreate,
  ContentItem,
  ContentUpdate,
  CostSummary,
  Publication,
  PublicationCreate,
  PublicationUpdate,
  Report,
  ReportArtifact,
  ReportCreate,
  ReportDelivery,
  ReportDeliveryRequest
} from "@growth-manager/contracts";
import { parseConfig } from "@growth-manager/config";
import {
  and,
  desc,
  eq,
  gte,
  lt,
  schema,
  sql,
  type Database,
  type DatabaseClient
} from "@growth-manager/database";
import { DomainError, newId, requirePermission, type TenantContext } from "@growth-manager/domain";
import { DATABASE } from "./database.provider.js";

@Injectable()
export class OperationsService {
  private readonly config = parseConfig(process.env);
  public constructor(@Inject(DATABASE) private readonly client: DatabaseClient) {}

  public listAlerts(context: TenantContext): Promise<readonly Alert[]> {
    requirePermission(context, "metrics.read");
    return this.client.withTenant(context, async (database) => {
      const rows = await database
        .select()
        .from(schema.alerts)
        .where(eq(schema.alerts.tenantId, context.tenantId))
        .orderBy(desc(schema.alerts.lastSeenAt))
        .limit(200);
      return rows.map(toAlert);
    });
  }

  public updateAlert(
    context: TenantContext,
    alertId: string,
    idempotencyKey: string,
    input: AlertUpdate
  ): Promise<Alert> {
    requirePermission(context, "tasks.write");
    return this.client.withTenant(context, async (database) => {
      const rows = await database
        .update(schema.alerts)
        .set({
          status: input.status,
          acknowledgedBy: context.userId,
          resolvedBy: input.status === "resolved" ? context.userId : null,
          resolvedAt: input.status === "resolved" ? new Date() : null,
          updatedAt: new Date(),
          version: input.version + 1
        })
        .where(
          and(
            eq(schema.alerts.id, alertId),
            eq(schema.alerts.tenantId, context.tenantId),
            eq(schema.alerts.version, input.version),
            eq(schema.alerts.status, "open")
          )
        )
        .returning();
      const row = rows[0];
      if (row === undefined)
        throw conflict("GM-ALERT-CONFLICT", "Alerta já alterado ou inexistente.");
      await this.outbox(database, context, idempotencyKey, "alert", alertId, "alert_updated", {
        alert_id: alertId,
        status: input.status
      });
      return toAlert(row);
    });
  }

  public getCosts(context: TenantContext, requestedMonth?: string): Promise<CostSummary> {
    requirePermission(context, "costs.read");
    return this.client.withTenant(context, async (database) => {
      const now = new Date();
      const month =
        requestedMonth ??
        `${String(now.getUTCFullYear())}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
      const start = new Date(`${month}-01T00:00:00.000Z`);
      const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
      const [usage, budgets] = await Promise.all([
        database
          .select()
          .from(schema.usageEvents)
          .where(
            and(
              eq(schema.usageEvents.tenantId, context.tenantId),
              gte(schema.usageEvents.occurredAt, start),
              lt(schema.usageEvents.occurredAt, end)
            )
          ),
        database
          .select()
          .from(schema.budgets)
          .where(eq(schema.budgets.tenantId, context.tenantId))
          .orderBy(desc(schema.budgets.effectiveFrom))
      ]);
      const totals = new Map<string, { cost: number; quantity: number }>();
      for (const row of usage) {
        const current = totals.get(row.provider) ?? { cost: 0, quantity: 0 };
        current.cost += Number(row.cost);
        current.quantity += Number(row.quantity);
        totals.set(row.provider, current);
      }
      const currency = budgets[0]?.currency ?? usage[0]?.currency ?? "BRL";
      const byProvider = [...totals.entries()].map(([provider, value]) => ({ provider, ...value }));
      return {
        period_start: `${month}-01`,
        period_end: new Date(end.getTime() - 86_400_000).toISOString().slice(0, 10),
        currency,
        total: byProvider.reduce((sum, item) => sum + item.cost, 0),
        by_provider: byProvider,
        budgets: budgets.map(toBudget)
      };
    });
  }

  public upsertBudget(
    context: TenantContext,
    idempotencyKey: string,
    input: BudgetUpsert
  ): Promise<Budget> {
    requirePermission(context, "costs.manage");
    return this.client.withTenant(context, async (database) => {
      const rows = await database
        .insert(schema.budgets)
        .values({
          id: newId(),
          tenantId: context.tenantId,
          provider: input.provider,
          period: "monthly",
          softLimit: String(input.soft_limit),
          hardLimit: String(input.hard_limit),
          currency: input.currency,
          essentialOverride: input.essential_override,
          effectiveFrom: input.effective_from
        })
        .onConflictDoUpdate({
          target: [schema.budgets.tenantId, schema.budgets.provider, schema.budgets.effectiveFrom],
          set: {
            softLimit: String(input.soft_limit),
            hardLimit: String(input.hard_limit),
            currency: input.currency,
            essentialOverride: input.essential_override,
            updatedAt: new Date(),
            version: sql`${schema.budgets.version} + 1`
          }
        })
        .returning();
      const row = required(rows[0], "GM-BUDGET-NOT-SAVED", "Orçamento não foi salvo.");
      await this.outbox(database, context, idempotencyKey, "budget", row.id, "budget_saved", {
        budget_id: row.id,
        provider: row.provider
      });
      return toBudget(row);
    });
  }

  public getBrandKit(context: TenantContext): Promise<BrandKit | null> {
    requirePermission(context, "content.read");
    return this.client.withTenant(context, async (database) => {
      const rows = await database
        .select()
        .from(schema.brandKits)
        .where(
          and(eq(schema.brandKits.tenantId, context.tenantId), eq(schema.brandKits.isActive, true))
        )
        .limit(1);
      return rows[0] === undefined ? null : toBrandKit(rows[0]);
    });
  }

  public upsertBrandKit(
    context: TenantContext,
    idempotencyKey: string,
    input: BrandKitUpsert
  ): Promise<BrandKit> {
    requirePermission(context, "content.write");
    return this.client.withTenant(context, async (database) => {
      const existingRows = await database
        .select()
        .from(schema.brandKits)
        .where(
          and(eq(schema.brandKits.tenantId, context.tenantId), eq(schema.brandKits.isActive, true))
        )
        .limit(1);
      const existing = existingRows[0];
      let row: typeof schema.brandKits.$inferSelect;
      if (existing === undefined) {
        if (input.version !== undefined)
          throw conflict("GM-BRAND-CONFLICT", "A identidade visual mudou.");
        const inserted = await database
          .insert(schema.brandKits)
          .values({
            id: newId(),
            tenantId: context.tenantId,
            name: input.name,
            voice: input.voice,
            audiences: input.audiences,
            allowedClaims: input.allowed_claims,
            forbiddenClaims: input.forbidden_claims,
            visualTokens: input.visual_tokens
          })
          .returning();
        row = required(inserted[0], "GM-BRAND-NOT-SAVED", "Identidade visual não foi salva.");
      } else {
        if (input.version === undefined || input.version !== existing.version) {
          throw conflict("GM-BRAND-CONFLICT", "A identidade visual foi alterada por outra pessoa.");
        }
        const updated = await database
          .update(schema.brandKits)
          .set({
            name: input.name,
            voice: input.voice,
            audiences: input.audiences,
            allowedClaims: input.allowed_claims,
            forbiddenClaims: input.forbidden_claims,
            visualTokens: input.visual_tokens,
            updatedAt: new Date(),
            version: input.version + 1
          })
          .where(
            and(eq(schema.brandKits.id, existing.id), eq(schema.brandKits.version, input.version))
          )
          .returning();
        row = required(
          updated[0],
          "GM-BRAND-CONFLICT",
          "A identidade visual foi alterada por outra pessoa."
        );
      }
      await this.outbox(database, context, idempotencyKey, "brand_kit", row.id, "brand_kit_saved", {
        brand_kit_id: row.id,
        version: row.version
      });
      return toBrandKit(row);
    });
  }

  public listContent(context: TenantContext): Promise<readonly ContentItem[]> {
    requirePermission(context, "content.read");
    return this.client.withTenant(context, async (database) => {
      const rows = await database
        .select({ item: schema.contentItems, body: schema.contentVersions.body })
        .from(schema.contentItems)
        .innerJoin(
          schema.contentVersions,
          and(
            eq(schema.contentVersions.contentItemId, schema.contentItems.id),
            eq(schema.contentVersions.version, schema.contentItems.currentVersion),
            eq(schema.contentVersions.tenantId, context.tenantId)
          )
        )
        .where(eq(schema.contentItems.tenantId, context.tenantId))
        .orderBy(desc(schema.contentItems.updatedAt))
        .limit(200);
      return rows.map((row) => toContent(row.item, row.body));
    });
  }

  public createContent(
    context: TenantContext,
    idempotencyKey: string,
    input: ContentCreate
  ): Promise<ContentItem> {
    requirePermission(context, "content.write");
    return this.client.withTenant(context, async (database) => {
      const id = newId();
      const inserted = await database
        .insert(schema.contentItems)
        .values({
          id,
          tenantId: context.tenantId,
          channel: input.channel,
          type: input.type,
          title: input.title,
          status: "draft",
          timezone: input.timezone,
          ownerId: input.owner_id,
          brandKitId: input.brand_kit_id,
          campaign: input.campaign
        })
        .returning();
      const item = required(inserted[0], "GM-CONTENT-NOT-CREATED", "Conteúdo não foi criado.");
      await database.insert(schema.contentVersions).values({
        id: newId(),
        tenantId: context.tenantId,
        contentItemId: id,
        version: 1,
        body: input.body,
        metadata: {},
        createdBy: context.userId,
        sha256: digest(input.body)
      });
      await this.outbox(database, context, idempotencyKey, "content", id, "content_created", {
        content_item_id: id,
        version: 1
      });
      return toContent(item, input.body);
    });
  }

  public updateContent(
    context: TenantContext,
    contentId: string,
    idempotencyKey: string,
    input: ContentUpdate
  ): Promise<ContentItem> {
    requirePermission(context, "content.write");
    return this.client.withTenant(context, async (database) => {
      const currentRows = await database
        .select({ item: schema.contentItems, body: schema.contentVersions.body })
        .from(schema.contentItems)
        .innerJoin(
          schema.contentVersions,
          and(
            eq(schema.contentVersions.contentItemId, schema.contentItems.id),
            eq(schema.contentVersions.version, schema.contentItems.currentVersion)
          )
        )
        .where(
          and(
            eq(schema.contentItems.id, contentId),
            eq(schema.contentItems.tenantId, context.tenantId)
          )
        )
        .limit(1);
      const current = required(currentRows[0], "GM-CONTENT-NOT-FOUND", "Conteúdo não encontrado.");
      if (current.item.version !== input.version) {
        throw conflict("GM-CONTENT-CONFLICT", "O conteúdo foi alterado por outra pessoa.");
      }
      const nextBody = input.body ?? current.body;
      const nextContentVersion = current.item.currentVersion + 1;
      const updated = await database
        .update(schema.contentItems)
        .set({
          title: input.title ?? current.item.title,
          status: input.status ?? current.item.status,
          ownerId: input.owner_id === undefined ? current.item.ownerId : input.owner_id,
          campaign: input.campaign === undefined ? current.item.campaign : input.campaign,
          currentVersion: nextContentVersion,
          version: input.version + 1,
          updatedAt: new Date()
        })
        .where(
          and(eq(schema.contentItems.id, contentId), eq(schema.contentItems.version, input.version))
        )
        .returning();
      const item = required(
        updated[0],
        "GM-CONTENT-CONFLICT",
        "O conteúdo foi alterado por outra pessoa."
      );
      await database.insert(schema.contentVersions).values({
        id: newId(),
        tenantId: context.tenantId,
        contentItemId: contentId,
        version: nextContentVersion,
        body: nextBody,
        metadata: {},
        createdBy: context.userId,
        sha256: digest(nextBody)
      });
      await this.outbox(
        database,
        context,
        idempotencyKey,
        "content",
        contentId,
        "content_updated",
        {
          content_item_id: contentId,
          version: nextContentVersion
        }
      );
      return toContent(item, nextBody);
    });
  }

  public listPublications(context: TenantContext): Promise<readonly Publication[]> {
    requirePermission(context, "content.read");
    return this.client.withTenant(context, async (database) => {
      const rows = await database
        .select({ publication: schema.publications, contentTitle: schema.contentItems.title })
        .from(schema.publications)
        .innerJoin(
          schema.contentItems,
          eq(schema.contentItems.id, schema.publications.contentItemId)
        )
        .where(eq(schema.publications.tenantId, context.tenantId))
        .orderBy(schema.publications.scheduledAt)
        .limit(300);
      return rows.map((row) => toPublication(row.publication, row.contentTitle));
    });
  }

  public submitContent(
    context: TenantContext,
    contentId: string,
    idempotencyKey: string
  ): Promise<unknown> {
    requirePermission(context, "content.write");
    return this.client.withTenant(context, async (database) => {
      const rows = await database
        .select({ item: schema.contentItems, sha256: schema.contentVersions.sha256 })
        .from(schema.contentItems)
        .innerJoin(
          schema.contentVersions,
          and(
            eq(schema.contentVersions.contentItemId, schema.contentItems.id),
            eq(schema.contentVersions.version, schema.contentItems.currentVersion)
          )
        )
        .where(
          and(
            eq(schema.contentItems.id, contentId),
            eq(schema.contentItems.tenantId, context.tenantId),
            eq(schema.contentItems.status, "draft")
          )
        )
        .limit(1);
      const current = required(
        rows[0],
        "GM-CONTENT-NOT-DRAFT",
        "Somente um rascunho pode ser enviado para aprovação."
      );
      const approvalId = newId();
      const inserted = await database
        .insert(schema.approvals)
        .values({
          id: approvalId,
          tenantId: context.tenantId,
          subjectType: "content",
          subjectId: contentId,
          subjectVersion: current.item.currentVersion,
          risk: "medium",
          status: "pending",
          requestedBy: context.userId,
          contentSha256: current.sha256
        })
        .returning();
      const approval = required(inserted[0], "GM-CONTENT-APPROVAL", "A aprovação não foi criada.");
      await database
        .update(schema.contentItems)
        .set({
          status: "review",
          updatedAt: new Date(),
          version: sql`${schema.contentItems.version} + 1`
        })
        .where(eq(schema.contentItems.id, contentId));
      await this.outbox(
        database,
        context,
        idempotencyKey,
        "content",
        contentId,
        "content_submitted",
        {
          content_item_id: contentId,
          approval_id: approvalId,
          content_version: current.item.currentVersion
        }
      );
      return { id: approval.id, status: approval.status };
    });
  }

  public createPublication(
    context: TenantContext,
    idempotencyKey: string,
    input: PublicationCreate
  ): Promise<Publication> {
    requirePermission(context, "content.write");
    return this.client.withTenant(context, async (database) => {
      const contentRows = await database
        .select()
        .from(schema.contentItems)
        .where(
          and(
            eq(schema.contentItems.id, input.content_item_id),
            eq(schema.contentItems.tenantId, context.tenantId)
          )
        )
        .limit(1);
      const content = required(contentRows[0], "GM-CONTENT-NOT-FOUND", "Conteúdo não encontrado.");
      if (content.status !== "approved") {
        throw new DomainError(
          "GM-PUBLICATION-NOT-APPROVED",
          "Aprove o conteúdo antes de agendar.",
          false
        );
      }
      const properties = await database
        .select()
        .from(schema.integrationProperties)
        .where(
          and(
            eq(schema.integrationProperties.id, input.property_id),
            eq(schema.integrationProperties.tenantId, context.tenantId)
          )
        )
        .limit(1);
      if (properties[0] === undefined) {
        throw new DomainError(
          "GM-PUBLICATION-PROPERTY",
          "Propriedade conectada não encontrada.",
          false
        );
      }
      const id = newId();
      const inserted = await database
        .insert(schema.publications)
        .values({
          id,
          tenantId: context.tenantId,
          contentItemId: content.id,
          contentVersion: content.currentVersion,
          provider: input.provider,
          propertyId: input.property_id,
          status: "scheduled",
          scheduledAt: new Date(input.scheduled_at),
          idempotencyKey
        })
        .onConflictDoNothing()
        .returning();
      let publication = inserted[0];
      if (publication === undefined) {
        const existing = await database
          .select()
          .from(schema.publications)
          .where(
            and(
              eq(schema.publications.tenantId, context.tenantId),
              eq(schema.publications.idempotencyKey, idempotencyKey)
            )
          )
          .limit(1);
        publication = required(
          existing[0],
          "GM-PUBLICATION-NOT-CREATED",
          "Agendamento não foi criado."
        );
      } else {
        await database
          .update(schema.contentItems)
          .set({
            status: "scheduled",
            scheduledAt: new Date(input.scheduled_at),
            updatedAt: new Date(),
            version: sql`${schema.contentItems.version} + 1`
          })
          .where(eq(schema.contentItems.id, content.id));
        await this.outbox(
          database,
          context,
          `publication:${idempotencyKey}`,
          "publication",
          id,
          "publication_scheduled",
          {
            publication_id: id,
            content_item_id: content.id
          }
        );
      }
      return toPublication(publication, content.title);
    });
  }

  public updatePublication(
    context: TenantContext,
    publicationId: string,
    idempotencyKey: string,
    input: PublicationUpdate
  ): Promise<Publication> {
    requirePermission(context, "content.write");
    return this.client.withTenant(context, async (database) => {
      const updates: Partial<typeof schema.publications.$inferInsert> = {
        updatedAt: new Date(),
        version: input.version + 1
      };
      if (input.scheduled_at !== undefined) updates.scheduledAt = new Date(input.scheduled_at);
      if (input.status !== undefined) updates.status = input.status;
      const rows = await database
        .update(schema.publications)
        .set(updates)
        .where(
          and(
            eq(schema.publications.id, publicationId),
            eq(schema.publications.tenantId, context.tenantId),
            eq(schema.publications.version, input.version),
            sql`${schema.publications.status} in ('scheduled', 'queued')`
          )
        )
        .returning();
      const publication = required(
        rows[0],
        "GM-PUBLICATION-CONFLICT",
        "A publicação já iniciou ou foi alterada."
      );
      const contentRows = await database
        .select({ title: schema.contentItems.title })
        .from(schema.contentItems)
        .where(eq(schema.contentItems.id, publication.contentItemId))
        .limit(1);
      await this.outbox(
        database,
        context,
        idempotencyKey,
        "publication",
        publicationId,
        "publication_updated",
        {
          publication_id: publicationId,
          status: publication.status
        }
      );
      return toPublication(publication, contentRows[0]?.title ?? "Conteúdo");
    });
  }

  public listReports(context: TenantContext): Promise<readonly Report[]> {
    requirePermission(context, "reports.read");
    return this.client.withTenant(context, async (database) => {
      const rows = await database
        .select()
        .from(schema.reports)
        .where(eq(schema.reports.tenantId, context.tenantId))
        .orderBy(desc(schema.reports.periodEnd))
        .limit(100);
      return rows.map(toReport);
    });
  }

  public createReport(
    context: TenantContext,
    idempotencyKey: string,
    input: ReportCreate
  ): Promise<Report> {
    requirePermission(context, "reports.read");
    return this.client.withTenant(context, async (database) => {
      const countRows = await database
        .select({ value: sql<number>`count(*)::int` })
        .from(schema.reports)
        .where(eq(schema.reports.tenantId, context.tenantId));
      const id = newId();
      const inserted = await database
        .insert(schema.reports)
        .values({
          id,
          tenantId: context.tenantId,
          periodStart: input.period_start,
          periodEnd: input.period_end,
          status: "queued",
          firstReport: (countRows[0]?.value ?? 0) === 0
        })
        .onConflictDoNothing()
        .returning();
      let report = inserted[0];
      if (report === undefined) {
        const existing = await database
          .select()
          .from(schema.reports)
          .where(
            and(
              eq(schema.reports.tenantId, context.tenantId),
              eq(schema.reports.periodStart, input.period_start),
              eq(schema.reports.periodEnd, input.period_end)
            )
          )
          .limit(1);
        report = required(existing[0], "GM-REPORT-NOT-CREATED", "Relatório não foi criado.");
      } else {
        await this.outbox(database, context, idempotencyKey, "report", id, "report_requested", {
          report_id: id,
          period_start: input.period_start,
          period_end: input.period_end
        });
      }
      return toReport(report);
    });
  }

  public getReportArtifact(context: TenantContext, reportId: string): Promise<ReportArtifact> {
    requirePermission(context, "reports.read");
    return this.client.withTenant(context, async (database) => {
      const rows = await database
        .select({
          htmlObjectKey: schema.reportSnapshots.htmlObjectKey,
          pdfObjectKey: schema.reportSnapshots.pdfObjectKey
        })
        .from(schema.reportSnapshots)
        .innerJoin(schema.reports, eq(schema.reports.id, schema.reportSnapshots.reportId))
        .where(
          and(
            eq(schema.reportSnapshots.reportId, reportId),
            eq(schema.reportSnapshots.tenantId, context.tenantId),
            eq(schema.reportSnapshots.version, schema.reports.currentVersion)
          )
        )
        .limit(1);
      const snapshot = required(
        rows[0],
        "GM-REPORT-NOT-READY",
        "O relatório ainda está sendo gerado."
      );
      const expiresIn = 3600;
      const htmlUrl = await this.signReportObject(snapshot.htmlObjectKey, expiresIn);
      const pdfUrl =
        snapshot.pdfObjectKey === null
          ? null
          : await this.signReportObject(snapshot.pdfObjectKey, expiresIn);
      return {
        html_url: htmlUrl,
        pdf_url: pdfUrl,
        expires_at: new Date(Date.now() + expiresIn * 1000).toISOString()
      };
    });
  }

  public submitReport(
    context: TenantContext,
    reportId: string,
    idempotencyKey: string
  ): Promise<unknown> {
    requirePermission(context, "reports.read");
    return this.client.withTenant(context, async (database) => {
      const rows = await database
        .select({ report: schema.reports, sha256: schema.reportSnapshots.sha256 })
        .from(schema.reports)
        .innerJoin(
          schema.reportSnapshots,
          and(
            eq(schema.reportSnapshots.reportId, schema.reports.id),
            eq(schema.reportSnapshots.version, schema.reports.currentVersion)
          )
        )
        .where(
          and(
            eq(schema.reports.id, reportId),
            eq(schema.reports.tenantId, context.tenantId),
            eq(schema.reports.status, "draft")
          )
        )
        .limit(1);
      const current = required(
        rows[0],
        "GM-REPORT-NOT-DRAFT",
        "O relatório ainda não está pronto para aprovação."
      );
      const pendingRows = await database
        .select()
        .from(schema.approvals)
        .where(
          and(
            eq(schema.approvals.tenantId, context.tenantId),
            eq(schema.approvals.subjectType, "report"),
            eq(schema.approvals.subjectId, reportId),
            eq(schema.approvals.subjectVersion, current.report.currentVersion),
            eq(schema.approvals.status, "pending")
          )
        )
        .limit(1);
      const pending = pendingRows[0];
      if (pending !== undefined) return { id: pending.id, status: pending.status };
      const approvalId = newId();
      const inserted = await database
        .insert(schema.approvals)
        .values({
          id: approvalId,
          tenantId: context.tenantId,
          subjectType: "report",
          subjectId: reportId,
          subjectVersion: current.report.currentVersion,
          risk: "medium",
          status: "pending",
          requestedBy: context.userId,
          contentSha256: current.sha256
        })
        .returning();
      const approval = required(inserted[0], "GM-REPORT-APPROVAL", "A aprovação não foi criada.");
      await this.outbox(database, context, idempotencyKey, "report", reportId, "report_submitted", {
        report_id: reportId,
        approval_id: approvalId,
        version: current.report.currentVersion
      });
      return { id: approval.id, status: approval.status };
    });
  }

  public createReportDelivery(
    context: TenantContext,
    reportId: string,
    idempotencyKey: string,
    input: ReportDeliveryRequest
  ): Promise<ReportDelivery> {
    requirePermission(context, "reports.deliver");
    return this.client.withTenant(context, async (database) => {
      const reportRows = await database
        .select()
        .from(schema.reports)
        .where(
          and(
            eq(schema.reports.id, reportId),
            eq(schema.reports.tenantId, context.tenantId),
            eq(schema.reports.status, "approved")
          )
        )
        .limit(1);
      const report = required(
        reportRows[0],
        "GM-REPORT-NOT-APPROVED",
        "Aprove o relatório antes de enviar."
      );
      const recipientRows = await database
        .insert(schema.reportRecipients)
        .values({
          id: newId(),
          tenantId: context.tenantId,
          reportId,
          email: input.email,
          name: input.name,
          kind: "client",
          addedBy: context.userId,
          active: true
        })
        .onConflictDoUpdate({
          target: [schema.reportRecipients.reportId, schema.reportRecipients.email],
          set: { name: input.name, active: true, updatedAt: new Date() }
        })
        .returning();
      const recipient = required(
        recipientRows[0],
        "GM-REPORT-RECIPIENT",
        "Destinatário não foi salvo."
      );
      const deliveryRows = await database
        .insert(schema.reportDeliveries)
        .values({
          id: newId(),
          tenantId: context.tenantId,
          reportId,
          snapshotVersion: report.currentVersion,
          recipientId: recipient.id,
          channel: "email",
          status: "queued",
          idempotencyKey
        })
        .onConflictDoNothing()
        .returning();
      let delivery = deliveryRows[0];
      if (delivery === undefined) {
        const existing = await database
          .select()
          .from(schema.reportDeliveries)
          .where(
            and(
              eq(schema.reportDeliveries.tenantId, context.tenantId),
              eq(schema.reportDeliveries.idempotencyKey, idempotencyKey)
            )
          )
          .limit(1);
        delivery = required(existing[0], "GM-REPORT-DELIVERY", "Entrega não foi criada.");
      } else {
        await this.outbox(
          database,
          context,
          `delivery:${idempotencyKey}`,
          "report_delivery",
          delivery.id,
          "report_delivery_requested",
          {
            delivery_id: delivery.id,
            report_id: reportId
          }
        );
      }
      return {
        id: delivery.id,
        tenant_id: delivery.tenantId,
        report_id: delivery.reportId,
        email: recipient.email,
        status: delivery.status as ReportDelivery["status"],
        attempt: delivery.attempt,
        created_at: delivery.createdAt.toISOString()
      };
    });
  }

  private async signReportObject(objectKey: string, expiresIn: number): Promise<string> {
    const encodedKey = objectKey.split("/").map(encodeURIComponent).join("/");
    const response = await fetch(
      `${this.config.SUPABASE_URL.replace(/\/$/u, "")}/storage/v1/object/sign/reports/${encodedKey}`,
      {
        method: "POST",
        headers: {
          apikey: this.config.SUPABASE_SECRET_KEY,
          Authorization: `Bearer ${this.config.SUPABASE_SECRET_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ expiresIn }),
        signal: AbortSignal.timeout(5_000)
      }
    );
    if (!response.ok) {
      throw new DomainError("GM-REPORT-LINK", "Não foi possível abrir o relatório.", true);
    }
    const payload = z.object({ signedURL: z.string().min(1) }).parse(await response.json());
    return new URL(payload.signedURL, this.config.SUPABASE_URL).toString();
  }

  private async outbox(
    database: Database,
    context: TenantContext,
    idempotencyKey: string,
    aggregateType: string,
    aggregateId: string,
    eventType: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    await database.insert(schema.outboxEvents).values({
      id: newId(),
      tenantId: context.tenantId,
      aggregateType,
      aggregateId,
      eventType,
      schemaVersion: "1",
      idempotencyKey: `${aggregateType}:${context.tenantId}:${idempotencyKey}`,
      payload,
      traceId: context.traceId
    });
  }
}

function required<T>(value: T | undefined, code: `GM-${string}`, message: string): T {
  if (value === undefined) throw new DomainError(code, message, false);
  return value;
}

function conflict(code: `GM-${string}`, message: string): DomainError {
  return new DomainError(code, message, false);
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function asStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toAlert(row: typeof schema.alerts.$inferSelect): Alert {
  return {
    id: row.id,
    tenant_id: row.tenantId,
    type: row.type,
    severity: row.severity as Alert["severity"],
    status: row.status as Alert["status"],
    title: row.title,
    details: asRecord(row.details),
    occurrences: row.occurrences,
    first_seen_at: row.firstSeenAt.toISOString(),
    last_seen_at: row.lastSeenAt.toISOString(),
    resolved_at: row.resolvedAt?.toISOString() ?? null,
    version: row.version
  };
}

function toBudget(row: typeof schema.budgets.$inferSelect): Budget {
  return {
    id: row.id,
    tenant_id: row.tenantId,
    provider: row.provider,
    period: "monthly",
    soft_limit: Number(row.softLimit),
    hard_limit: Number(row.hardLimit),
    currency: row.currency,
    essential_override: row.essentialOverride,
    effective_from: row.effectiveFrom,
    version: row.version
  };
}

function toBrandKit(row: typeof schema.brandKits.$inferSelect): BrandKit {
  return {
    id: row.id,
    tenant_id: row.tenantId,
    name: row.name,
    voice: row.voice,
    audiences: asStrings(row.audiences),
    allowed_claims: asStrings(row.allowedClaims),
    forbidden_claims: asStrings(row.forbiddenClaims),
    visual_tokens: asRecord(row.visualTokens),
    is_active: row.isActive,
    version: row.version
  };
}

function toContent(row: typeof schema.contentItems.$inferSelect, body: string): ContentItem {
  return {
    id: row.id,
    tenant_id: row.tenantId,
    channel: row.channel as ContentItem["channel"],
    type: row.type as ContentItem["type"],
    title: row.title,
    status: row.status as ContentItem["status"],
    body,
    scheduled_at: row.scheduledAt?.toISOString() ?? null,
    timezone: row.timezone,
    owner_id: row.ownerId,
    brand_kit_id: row.brandKitId,
    campaign: row.campaign,
    current_version: row.currentVersion,
    version: row.version,
    updated_at: row.updatedAt.toISOString()
  };
}

function toPublication(
  row: typeof schema.publications.$inferSelect,
  contentTitle: string
): Publication {
  return {
    id: row.id,
    tenant_id: row.tenantId,
    content_item_id: row.contentItemId,
    content_title: contentTitle,
    content_version: row.contentVersion,
    provider: row.provider,
    property_id: row.propertyId,
    status: row.status as Publication["status"],
    scheduled_at: row.scheduledAt.toISOString(),
    external_id: row.externalId,
    failure_code: row.failureCode,
    version: row.version
  };
}

function toReport(row: typeof schema.reports.$inferSelect): Report {
  return {
    id: row.id,
    tenant_id: row.tenantId,
    period_start: row.periodStart,
    period_end: row.periodEnd,
    status: row.status as Report["status"],
    current_version: row.currentVersion,
    first_report: row.firstReport,
    approved_at: row.approvedAt?.toISOString() ?? null,
    published_at: row.publishedAt?.toISOString() ?? null,
    created_at: row.createdAt.toISOString(),
    version: row.version
  };
}
