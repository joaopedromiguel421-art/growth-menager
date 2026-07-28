import { Inject, Injectable } from "@nestjs/common";
import {
  seoAnalysisRunSchema,
  seoBaselineSchema,
  seoEvidenceSummarySchema,
  seoFindingImpactSchema,
  seoFindingOriginSchema,
  seoFindingSchema,
  seoMonitoringProfileSchema,
  seoTargetSchema,
  type SeoAnalysisRun,
  type SeoAnalysisRunRequest,
  type SeoBaseline,
  type SeoCapabilityCode,
  type SeoEvidenceSummary,
  type SeoFinding,
  type SeoFindingStatusUpdate,
  type SeoMonitoringProfile,
  type SeoMonitoringProfileInput,
  type SeoTarget,
  type SeoTargetCreate,
  type SeoTargetUpdate
} from "@growth-manager/contracts";
import { parseConfig } from "@growth-manager/config";
import {
  and,
  desc,
  eq,
  inArray,
  schema,
  type Database,
  type DatabaseClient
} from "@growth-manager/database";
import {
  DomainError,
  newId,
  requirePermission,
  SEO_PLANNER_VERSION,
  validateFindingStatusUpdate,
  type TenantContext
} from "@growth-manager/domain";
import { normalizeHttpUrl } from "@growth-manager/seo-engine";
import { DATABASE } from "./database.provider.js";

const allCapabilities = [
  "technical",
  "content",
  "schema",
  "sitemap",
  "performance",
  "visual",
  "google",
  "local",
  "maps",
  "competitor",
  "backlink",
  "ai_visibility",
  "sxo",
  "drift"
] as const satisfies readonly SeoCapabilityCode[];

@Injectable()
export class SeoService {
  private readonly config = parseConfig(process.env);

  public constructor(@Inject(DATABASE) private readonly client: DatabaseClient) {}

  public listTargets(context: TenantContext): Promise<readonly SeoTarget[]> {
    requirePermission(context, "seo.read");
    return this.client.withTenant(context, async (database) => {
      const rows = await database
        .select()
        .from(schema.seoTargets)
        .where(eq(schema.seoTargets.tenantId, context.tenantId))
        .orderBy(desc(schema.seoTargets.createdAt));
      return rows.map(toTarget);
    });
  }

  public createTarget(context: TenantContext, input: SeoTargetCreate): Promise<SeoTarget> {
    requirePermission(context, "seo.manage");
    return this.client.withTenant(context, async (database) => {
      if (input.location_id !== null) {
        const location = await database
          .select({ id: schema.locations.id })
          .from(schema.locations)
          .where(
            and(
              eq(schema.locations.id, input.location_id),
              eq(schema.locations.tenantId, context.tenantId)
            )
          )
          .limit(1);
        if (location.length === 0) {
          throw new DomainError("GM-SEO-LOCATION-NOT-FOUND", "Localidade não encontrada.", false);
        }
      }
      const normalizedUrl = normalizeHttpUrl(input.url);
      const parsed = new URL(normalizedUrl);
      const normalizedOrigin =
        input.scope === "origin" ? `${parsed.origin}/` : `${parsed.origin}${parsed.pathname}`;
      const targetId = newId();
      const profileId = newId();
      const rows = await database
        .insert(schema.seoTargets)
        .values({
          id: targetId,
          tenantId: context.tenantId,
          locationId: input.location_id,
          url: normalizedUrl,
          normalizedOrigin,
          scope: input.scope,
          locale: input.locale,
          timezone: input.timezone,
          status: "active",
          crawlPolicy: input.crawl_policy
        })
        .returning();
      const row = rows[0];
      if (row === undefined)
        throw new DomainError("GM-SEO-TARGET-NOT-CREATED", "O target não foi criado.", true);

      await database.insert(schema.seoMonitoringProfiles).values({
        id: profileId,
        tenantId: context.tenantId,
        targetId,
        enabledCapabilities: [...allCapabilities],
        cadence: { daily: true, weekly: true, monthly: true },
        criticalUrls: [normalizedUrl],
        geogrid: { enabled: false, grid_size: 7, radius_meters: 5000 },
        monthlyBudget: null,
        currency: "USD",
        nextDailyAt: addDays(new Date(), 1),
        nextWeeklyAt: addDays(new Date(), 7),
        nextMonthlyAt: addDays(new Date(), 30)
      });
      return toTarget(row);
    });
  }

  public updateTarget(
    context: TenantContext,
    targetId: string,
    input: SeoTargetUpdate
  ): Promise<SeoTarget> {
    requirePermission(context, "seo.manage");
    return this.client.withTenant(context, async (database) => {
      const rows = await database
        .update(schema.seoTargets)
        .set({
          ...(input.status === undefined ? {} : { status: input.status }),
          ...(input.locale === undefined ? {} : { locale: input.locale }),
          ...(input.timezone === undefined ? {} : { timezone: input.timezone }),
          ...(input.crawl_policy === undefined ? {} : { crawlPolicy: input.crawl_policy }),
          updatedAt: new Date(),
          version: input.version + 1
        })
        .where(
          and(
            eq(schema.seoTargets.id, targetId),
            eq(schema.seoTargets.tenantId, context.tenantId),
            eq(schema.seoTargets.version, input.version)
          )
        )
        .returning();
      const row = rows[0];
      if (row === undefined)
        throw new DomainError("GM-SEO-TARGET-VERSION", "Target ausente ou desatualizado.", false);
      return toTarget(row);
    });
  }

  public getMonitoringProfile(
    context: TenantContext,
    targetId: string
  ): Promise<SeoMonitoringProfile> {
    requirePermission(context, "seo.read");
    return this.client.withTenant(context, async (database) => {
      const rows = await database
        .select()
        .from(schema.seoMonitoringProfiles)
        .where(
          and(
            eq(schema.seoMonitoringProfiles.tenantId, context.tenantId),
            eq(schema.seoMonitoringProfiles.targetId, targetId)
          )
        )
        .limit(1);
      const row = rows[0];
      if (row === undefined)
        throw new DomainError(
          "GM-SEO-PROFILE-NOT-FOUND",
          "Perfil de monitoramento não encontrado.",
          false
        );
      return toProfile(row);
    });
  }

  public updateMonitoringProfile(
    context: TenantContext,
    targetId: string,
    input: SeoMonitoringProfileInput
  ): Promise<SeoMonitoringProfile> {
    requirePermission(context, "seo.manage");
    const version = input.version;
    if (version === undefined) {
      throw new DomainError("GM-SEO-PROFILE-VERSION", "Informe a versão atual do perfil.", false);
    }
    return this.client.withTenant(context, async (database) => {
      const rows = await database
        .update(schema.seoMonitoringProfiles)
        .set({
          enabledCapabilities: input.enabled_capabilities,
          cadence: input.cadence,
          criticalUrls: input.critical_urls,
          geogrid: input.geogrid,
          monthlyBudget: input.monthly_budget === null ? null : String(input.monthly_budget),
          currency: input.currency.toUpperCase(),
          updatedAt: new Date(),
          version: version + 1
        })
        .where(
          and(
            eq(schema.seoMonitoringProfiles.tenantId, context.tenantId),
            eq(schema.seoMonitoringProfiles.targetId, targetId),
            eq(schema.seoMonitoringProfiles.version, version)
          )
        )
        .returning();
      const row = rows[0];
      if (row === undefined)
        throw new DomainError("GM-SEO-PROFILE-VERSION", "Perfil ausente ou desatualizado.", false);
      return toProfile(row);
    });
  }

  public startAnalysis(
    context: TenantContext,
    idempotencyKey: string,
    input: SeoAnalysisRunRequest
  ): Promise<SeoAnalysisRun> {
    requirePermission(context, "seo.run");
    if (!this.config.FEATURE_SEO_MONITORING) {
      throw new DomainError(
        "GM-SEO-DISABLED",
        "O monitoramento SEO ainda não está habilitado.",
        false
      );
    }
    return this.client.withTenant(context, async (database) => {
      const targetRows = await database
        .select({ id: schema.seoTargets.id, status: schema.seoTargets.status })
        .from(schema.seoTargets)
        .where(
          and(
            eq(schema.seoTargets.id, input.target_id),
            eq(schema.seoTargets.tenantId, context.tenantId)
          )
        )
        .limit(1);
      if (targetRows[0]?.status !== "active") {
        throw new DomainError("GM-SEO-TARGET-INACTIVE", "Target inexistente ou inativo.", false);
      }
      const profileRows = await database
        .select()
        .from(schema.seoMonitoringProfiles)
        .where(
          and(
            eq(schema.seoMonitoringProfiles.targetId, input.target_id),
            eq(schema.seoMonitoringProfiles.tenantId, context.tenantId)
          )
        )
        .limit(1);
      const profile = profileRows[0];
      if (profile === undefined)
        throw new DomainError(
          "GM-SEO-PROFILE-NOT-FOUND",
          "Perfil de monitoramento não encontrado.",
          false
        );

      const runId = newId();
      const inserted = await database
        .insert(schema.seoAnalysisRuns)
        .values({
          id: runId,
          tenantId: context.tenantId,
          targetId: input.target_id,
          mode: input.mode,
          status: "queued",
          plannerVersion: SEO_PLANNER_VERSION,
          configVersion: `seo-profile-v${String(profile.version)}`,
          requestedCapabilities: input.capability_codes ?? profile.enabledCapabilities,
          idempotencyKey,
          requestedBy: context.userId,
          estimatedCost: "0",
          actualCost: "0",
          currency: profile.currency,
          coverage: "0"
        })
        .onConflictDoNothing()
        .returning();

      if (inserted.length > 0) {
        await database.insert(schema.outboxEvents).values({
          id: newId(),
          tenantId: context.tenantId,
          aggregateType: "seo_analysis",
          aggregateId: runId,
          eventType: "seo_analysis_requested",
          schemaVersion: "1",
          idempotencyKey: `seo:${context.tenantId}:${idempotencyKey}`,
          payload: { analysis_run_id: runId },
          traceId: context.traceId
        });
        const row = inserted[0];
        if (row === undefined) {
          throw new DomainError("GM-SEO-RUN-NOT-CREATED", "A análise não foi criada.", true);
        }
        return toAnalysisRun(row);
      }
      const existing = await database
        .select()
        .from(schema.seoAnalysisRuns)
        .where(
          and(
            eq(schema.seoAnalysisRuns.tenantId, context.tenantId),
            eq(schema.seoAnalysisRuns.idempotencyKey, idempotencyKey)
          )
        )
        .limit(1);
      if (existing[0] === undefined)
        throw new DomainError("GM-SEO-RUN-NOT-CREATED", "A análise não foi criada.", true);
      return toAnalysisRun(existing[0]);
    });
  }

  public getAnalysisRun(context: TenantContext, runId: string): Promise<SeoAnalysisRun> {
    requirePermission(context, "seo.read");
    return this.client.withTenant(context, async (database) => {
      const rows = await database
        .select()
        .from(schema.seoAnalysisRuns)
        .where(
          and(
            eq(schema.seoAnalysisRuns.tenantId, context.tenantId),
            eq(schema.seoAnalysisRuns.id, runId)
          )
        )
        .limit(1);
      if (rows[0] === undefined)
        throw new DomainError("GM-SEO-RUN-NOT-FOUND", "Análise não encontrada.", false);
      return toAnalysisRun(rows[0]);
    });
  }

  public listHistory(context: TenantContext, targetId: string): Promise<readonly SeoAnalysisRun[]> {
    requirePermission(context, "seo.read");
    return this.client.withTenant(context, async (database) => {
      const rows = await database
        .select()
        .from(schema.seoAnalysisRuns)
        .where(
          and(
            eq(schema.seoAnalysisRuns.tenantId, context.tenantId),
            eq(schema.seoAnalysisRuns.targetId, targetId)
          )
        )
        .orderBy(desc(schema.seoAnalysisRuns.createdAt))
        .limit(100);
      return rows.map(toAnalysisRun);
    });
  }

  public getBaseline(context: TenantContext, targetId: string): Promise<SeoBaseline | null> {
    requirePermission(context, "seo.read");
    return this.client.withTenant(context, async (database) => {
      const rows = await database
        .select()
        .from(schema.seoBaselines)
        .where(
          and(
            eq(schema.seoBaselines.tenantId, context.tenantId),
            eq(schema.seoBaselines.targetId, targetId),
            inArray(schema.seoBaselines.status, ["active", "provisional"])
          )
        )
        .orderBy(desc(schema.seoBaselines.establishedAt))
        .limit(1);
      return rows[0] === undefined ? null : toBaseline(rows[0]);
    });
  }

  public listFindings(context: TenantContext): Promise<readonly SeoFinding[]> {
    requirePermission(context, "seo.read");
    return this.client.withTenant(context, async (database) => {
      const findings = await database
        .select()
        .from(schema.seoFindings)
        .where(eq(schema.seoFindings.tenantId, context.tenantId))
        .orderBy(desc(schema.seoFindings.lastSeenAt))
        .limit(100);
      if (findings.length === 0) return [];
      const relations = await database
        .select()
        .from(schema.seoFindingEvidence)
        .where(
          and(
            eq(schema.seoFindingEvidence.tenantId, context.tenantId),
            inArray(
              schema.seoFindingEvidence.findingId,
              findings.map((finding) => finding.id)
            )
          )
        )
        .orderBy(schema.seoFindingEvidence.position);
      const evidenceByFinding = new Map<string, string[]>();
      for (const relation of relations) {
        const ids = evidenceByFinding.get(relation.findingId) ?? [];
        ids.push(relation.evidenceId);
        evidenceByFinding.set(relation.findingId, ids);
      }
      return findings.map((finding) => toFinding(finding, evidenceByFinding.get(finding.id) ?? []));
    });
  }

  public listFindingEvidence(
    context: TenantContext,
    findingId: string
  ): Promise<readonly SeoEvidenceSummary[]> {
    requirePermission(context, "seo.read");
    return this.client.withTenant(context, async (database) => {
      const rows = await database
        .select({ evidence: schema.evidence })
        .from(schema.seoFindingEvidence)
        .innerJoin(
          schema.evidence,
          and(
            eq(schema.evidence.id, schema.seoFindingEvidence.evidenceId),
            eq(schema.evidence.tenantId, schema.seoFindingEvidence.tenantId)
          )
        )
        .where(
          and(
            eq(schema.seoFindingEvidence.tenantId, context.tenantId),
            eq(schema.seoFindingEvidence.findingId, findingId)
          )
        )
        .orderBy(schema.seoFindingEvidence.position);
      return rows.map((row) => toEvidence(row.evidence));
    });
  }

  public updateFindingStatus(
    context: TenantContext,
    findingId: string,
    input: SeoFindingStatusUpdate
  ): Promise<SeoFinding> {
    requirePermission(context, "seo.findings.manage");
    return this.client.withTenant(context, async (database) => {
      const currentRows = await database
        .select()
        .from(schema.seoFindings)
        .where(
          and(
            eq(schema.seoFindings.tenantId, context.tenantId),
            eq(schema.seoFindings.id, findingId)
          )
        )
        .limit(1);
      const current = currentRows[0];
      if (current === undefined)
        throw new DomainError("GM-SEO-FINDING-NOT-FOUND", "Achado não encontrado.", false);
      validateFindingStatusUpdate(current.status as SeoFinding["status"], input);
      const recommendationId =
        input.status === "accepted" && current.recommendationId === null
          ? await this.convertFindingToTask(database, context, current)
          : current.recommendationId;
      const rows = await database
        .update(schema.seoFindings)
        .set({
          status: input.status,
          dismissedReason: input.status === "dismissed" ? input.reason : null,
          dismissedUntil:
            input.status === "dismissed" && input.dismiss_until !== null
              ? new Date(input.dismiss_until)
              : null,
          recommendationId,
          updatedAt: new Date(),
          version: input.version + 1
        })
        .where(
          and(
            eq(schema.seoFindings.tenantId, context.tenantId),
            eq(schema.seoFindings.id, findingId),
            eq(schema.seoFindings.version, input.version)
          )
        )
        .returning();
      if (rows[0] === undefined)
        throw new DomainError("GM-SEO-FINDING-VERSION", "Achado desatualizado.", false);
      const evidenceRows = await database
        .select({ id: schema.seoFindingEvidence.evidenceId })
        .from(schema.seoFindingEvidence)
        .where(
          and(
            eq(schema.seoFindingEvidence.tenantId, context.tenantId),
            eq(schema.seoFindingEvidence.findingId, findingId)
          )
        )
        .orderBy(schema.seoFindingEvidence.position);
      return toFinding(
        rows[0],
        evidenceRows.map((row) => row.id)
      );
    });
  }

  private async convertFindingToTask(
    database: Database,
    context: TenantContext,
    finding: typeof schema.seoFindings.$inferSelect
  ): Promise<string> {
    const recommendationId = newId();
    const severity = finding.severity;
    await database.insert(schema.recommendations).values({
      id: recommendationId,
      tenantId: context.tenantId,
      title: finding.title,
      description: finding.recommendation,
      category: "seo",
      status: "accepted",
      priorityScore:
        severity === "critical" ? 100 : severity === "high" ? 80 : severity === "medium" ? 60 : 40,
      impact: "0.8000",
      confidence: finding.confidence,
      urgency: severity === "critical" ? "1.0000" : "0.6000",
      alignment: "0.8000",
      effort: "0.5000",
      risk: severity === "critical" ? "critical" : severity === "high" ? "high" : "medium",
      rationale: finding.description,
      generatedBy: "rule",
      acceptedAt: new Date()
    });
    await database.insert(schema.tasks).values({
      id: newId(),
      tenantId: context.tenantId,
      recommendationId,
      title: finding.title,
      description: finding.recommendation,
      status: "backlog",
      priority: severity === "critical" ? "urgent" : severity === "high" ? "high" : "medium",
      source: "seo_finding"
    });
    return recommendationId;
  }
}

function toTarget(row: typeof schema.seoTargets.$inferSelect): SeoTarget {
  return seoTargetSchema.parse({
    id: row.id,
    tenant_id: row.tenantId,
    location_id: row.locationId,
    url: row.url,
    normalized_origin: row.normalizedOrigin,
    scope: row.scope,
    locale: row.locale,
    timezone: row.timezone,
    status: row.status,
    version: row.version,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString()
  });
}

function toProfile(row: typeof schema.seoMonitoringProfiles.$inferSelect): SeoMonitoringProfile {
  return seoMonitoringProfileSchema.parse({
    id: row.id,
    tenant_id: row.tenantId,
    target_id: row.targetId,
    enabled_capabilities: row.enabledCapabilities,
    cadence: row.cadence,
    critical_urls: row.criticalUrls,
    geogrid: row.geogrid,
    monthly_budget: row.monthlyBudget === null ? null : Number(row.monthlyBudget),
    currency: row.currency,
    version: row.version,
    next_daily_at: iso(row.nextDailyAt),
    next_weekly_at: iso(row.nextWeeklyAt),
    next_monthly_at: iso(row.nextMonthlyAt)
  });
}

function toAnalysisRun(row: typeof schema.seoAnalysisRuns.$inferSelect): SeoAnalysisRun {
  return seoAnalysisRunSchema.parse({
    id: row.id,
    tenant_id: row.tenantId,
    target_id: row.targetId,
    mode: row.mode,
    status: row.status,
    planner_version: row.plannerVersion,
    config_version: row.configVersion,
    requested_capabilities: row.requestedCapabilities,
    estimated_cost: Number(row.estimatedCost),
    actual_cost: Number(row.actualCost),
    currency: row.currency,
    coverage: Number(row.coverage),
    started_at: iso(row.startedAt),
    finished_at: iso(row.finishedAt),
    report_html_key: row.reportHtmlKey,
    report_pdf_key: row.reportPdfKey,
    created_at: row.createdAt.toISOString()
  });
}

function toFinding(
  row: typeof schema.seoFindings.$inferSelect,
  evidenceIds: readonly string[]
): SeoFinding {
  return seoFindingSchema.parse({
    id: row.id,
    tenant_id: row.tenantId,
    target_id: row.targetId,
    analysis_run_id: row.analysisRunId,
    code: row.code,
    category: row.category,
    severity: row.severity,
    title: row.title,
    description: row.description,
    confidence: {
      score: Number(row.confidence),
      coverage: Number(row.confidenceCoverage),
      freshness: Number(row.confidenceFreshness),
      agreement: Number(row.confidenceAgreement)
    },
    evidence_ids: evidenceIds,
    origin: seoFindingOriginSchema.parse(row.origin),
    recommendation: row.recommendation,
    impact: seoFindingImpactSchema.parse(row.impact),
    status: row.status,
    first_seen_at: row.firstSeenAt.toISOString(),
    last_seen_at: row.lastSeenAt.toISOString(),
    resolved_at: iso(row.resolvedAt),
    version: row.version
  });
}

function toEvidence(row: typeof schema.evidence.$inferSelect): SeoEvidenceSummary {
  return seoEvidenceSummarySchema.parse({
    id: row.id,
    source: row.source,
    source_ref: row.sourceRef,
    captured_at: row.capturedAt.toISOString(),
    title: row.title,
    excerpt: row.excerpt,
    facts: row.facts,
    sha256: row.sha256,
    fresh_until: iso(row.freshUntil)
  });
}

function toBaseline(row: typeof schema.seoBaselines.$inferSelect): SeoBaseline {
  return seoBaselineSchema.parse({
    id: row.id,
    tenant_id: row.tenantId,
    target_id: row.targetId,
    analysis_run_id: row.analysisRunId,
    status: row.status,
    coverage: Number(row.coverage),
    established_at: row.establishedAt.toISOString(),
    superseded_at: iso(row.supersededAt)
  });
}

function iso(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}
