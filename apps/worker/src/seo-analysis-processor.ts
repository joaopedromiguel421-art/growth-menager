import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { JobEnvelope, SeoAnalysisMode, SeoCapabilityCode } from "@growth-manager/contracts";
import type { AppConfig } from "@growth-manager/config";
import { schema, type Database } from "@growth-manager/database";
import {
  baselineStatus,
  evaluateBudget,
  newId,
  validateSeoFindingDraft,
  type SeoFindingDraft,
  type TenantContext
} from "@growth-manager/domain";
import {
  DeepSeekHttpGateway,
  SafeFetchClient,
  SupabaseRawArtifactStore,
  pseudonymousDeepSeekUserId
} from "@growth-manager/integrations";
import {
  analyzeContentPage,
  analyzeStructuredData,
  analyzeTechnicalPage,
  buildSeoPrompt,
  capabilityDefinition,
  comparePageSnapshots,
  parseHtmlDocument,
  planSeoAnalysis,
  ruleFinding,
  sha256Hex,
  SEO_PROMPT_REGISTRY,
  verifySeoAiOutput,
  type ParsedHtmlDocument,
  type SeoComparablePageSnapshot,
  type SeoRuleContext
} from "@growth-manager/seo-engine";
import type { JobResult } from "./job-processor.js";

const coreCapabilities = new Set<SeoCapabilityCode>(["technical", "content", "schema", "sitemap"]);

export class SeoAnalysisProcessor {
  private readonly safeFetch = new SafeFetchClient();
  private readonly artifacts: SupabaseRawArtifactStore;

  public constructor(private readonly config: AppConfig) {
    this.artifacts = new SupabaseRawArtifactStore({
      supabaseUrl: config.SUPABASE_URL,
      secretKey: config.SUPABASE_SECRET_KEY
    });
  }

  public process(job: JobEnvelope, context: TenantContext, database: Database): Promise<JobResult> {
    switch (job.job_type) {
      case "seo_analysis_plan":
        return this.plan(job, context, database);
      case "seo_capability_execute":
        return this.executeCapability(job, context, database);
      case "seo_analysis_aggregate":
        return this.aggregate(job, context, database);
      case "seo_baseline_compare":
        return this.compareBaseline(job, context, database);
      case "seo_report_render":
        return this.renderReport(job, context, database);
      default:
        throw new Error(`Unsupported SEO job type: ${job.job_type}`);
    }
  }

  private async plan(
    job: JobEnvelope,
    context: TenantContext,
    database: Database
  ): Promise<JobResult> {
    const runId = requiredString(job.payload.analysis_run_id, "analysis_run_id");
    const run = await this.run(database, context.tenantId, runId);
    const targetRows = await database
      .select()
      .from(schema.seoTargets)
      .where(
        and(
          eq(schema.seoTargets.tenantId, context.tenantId),
          eq(schema.seoTargets.id, run.targetId)
        )
      )
      .limit(1);
    const profileRows = await database
      .select()
      .from(schema.seoMonitoringProfiles)
      .where(
        and(
          eq(schema.seoMonitoringProfiles.tenantId, context.tenantId),
          eq(schema.seoMonitoringProfiles.targetId, run.targetId)
        )
      )
      .limit(1);
    const target = targetRows[0];
    const profile = profileRows[0];
    if (target === undefined || profile === undefined)
      throw new Error("SEO run target or profile is missing");

    await database
      .update(schema.seoAnalysisRuns)
      .set({ status: "planning", startedAt: run.startedAt ?? new Date(), updatedAt: new Date() })
      .where(eq(schema.seoAnalysisRuns.id, run.id));

    const acquisition = await this.acquire(database, context, run, target);
    const integrations = await this.availableIntegrations(database, context.tenantId);
    const keywordCount = await this.countActiveKeywords(database, context.tenantId, target.id);
    const competitorCount = await this.countActiveCompetitors(
      database,
      context.tenantId,
      target.id
    );
    const baselineAvailable = await this.hasBaseline(database, context.tenantId, target.id);
    const dueCapabilities = dueCapabilitySet(job, run.mode as SeoAnalysisMode);
    const requestedCapabilities = new Set(run.requestedCapabilities as SeoCapabilityCode[]);
    const executionPlan = planSeoAnalysis({
      mode: run.mode as SeoAnalysisMode,
      enabledCapabilities: new Set(profile.enabledCapabilities as SeoCapabilityCode[]),
      requestedCapabilities,
      acquisitionAvailable: true,
      budgetAvailable: profile.monthlyBudget !== null,
      dueCapabilities,
      integrations,
      hasLocation: target.locationId !== null,
      hasLocalSignals: target.locationId !== null,
      geogridEnabled: readBoolean(profile.geogrid, "enabled"),
      activeKeywordCount: keywordCount,
      competitorCount,
      baselineAvailable,
      spaDetected: acquisition.document.renderSuggested,
      visualRequested: false,
      previousRegressions: new Set()
    });

    let queued = 0;
    for (const item of executionPlan.items) {
      const capabilityRunId = newId();
      const inserted = await database
        .insert(schema.seoCapabilityRuns)
        .values({
          id: capabilityRunId,
          tenantId: context.tenantId,
          analysisRunId: run.id,
          capabilityCode: item.capabilityCode,
          status: item.status,
          skipReason: item.status === "skipped" ? item.reason : null,
          ruleVersion: item.ruleVersion,
          attempt: 0,
          estimatedCost: "0",
          actualCost: "0",
          inputTokens: 0,
          outputTokens: 0
        })
        .onConflictDoNothing()
        .returning({ id: schema.seoCapabilityRuns.id });
      if (item.status !== "queued") continue;
      queued += 1;
      const persistedId =
        inserted[0]?.id ??
        (await this.capabilityRunId(database, context.tenantId, run.id, item.capabilityCode));
      await this.emit(database, {
        tenantId: context.tenantId,
        aggregateId: persistedId,
        aggregateType: "seo_capability",
        eventType: "seo_capability_requested",
        idempotencyKey: `seo:capability:${run.id}:${item.capabilityCode}`,
        traceId: context.traceId,
        payload: {
          analysis_run_id: run.id,
          capability_run_id: persistedId,
          capability_code: item.capabilityCode
        }
      });
    }

    await database
      .update(schema.seoAnalysisRuns)
      .set({
        status: "running",
        plannerVersion: executionPlan.plannerVersion,
        updatedAt: new Date()
      })
      .where(eq(schema.seoAnalysisRuns.id, run.id));
    if (queued === 0) await this.emitAnalysisReady(database, context, run.id);
    return {
      status: "completed",
      cursor: null,
      details: {
        analysis_run_id: run.id,
        capabilities_queued: queued,
        page_id: acquisition.pageId,
        evidence_id: acquisition.evidenceId
      }
    };
  }

  private async acquire(
    database: Database,
    context: TenantContext,
    run: typeof schema.seoAnalysisRuns.$inferSelect,
    target: typeof schema.seoTargets.$inferSelect
  ): Promise<{
    readonly pageId: string;
    readonly evidenceId: string;
    readonly document: ParsedHtmlDocument;
  }> {
    const policy = crawlPolicy(target.crawlPolicy);
    const response = await this.safeFetch.fetch(target.url, {
      timeoutMs: policy.timeoutMs,
      maxRedirects: policy.maxRedirects,
      maxBytes: 5 * 1024 * 1024,
      allowedContentTypes: ["text/html", "application/xhtml+xml"]
    });
    const html = new TextDecoder("utf-8", { fatal: false }).decode(response.body);
    const document = parseHtmlDocument({ url: response.finalUrl, html });
    const capturedAt = run.createdAt;
    const htmlSha256 = await sha256Hex(html);
    const contentSha256 = await sha256Hex(document.text);
    const schemaSha256 = await sha256Hex(JSON.stringify(document.structuredData));
    const evidenceSha256 = await sha256Hex(`${run.id}:${htmlSha256}`);

    await this.artifacts.putJson({
      tenantId: context.tenantId,
      category: "seo",
      artifactId: run.id,
      value: {
        url: response.finalUrl,
        captured_at: capturedAt.toISOString(),
        status: response.status,
        headers: response.headers,
        html
      }
    });
    const objectKey = `${context.tenantId}/seo/${run.id}.json`;
    await database
      .insert(schema.rawImports)
      .values({
        id: run.id,
        tenantId: context.tenantId,
        provider: "crawler",
        resourceType: "seo_page",
        resourceId: run.id,
        capturedAt,
        objectKey,
        sha256: htmlSha256,
        schemaVersion: "seo-page-v1",
        expiresAt: addDays(capturedAt, 90)
      })
      .onConflictDoNothing();

    const pageRows = await database
      .insert(schema.seoPages)
      .values({
        id: newId(),
        tenantId: context.tenantId,
        targetId: target.id,
        normalizedUrl: document.url,
        discoverySource: "target",
        pageType: "home",
        critical: true,
        firstSeenAt: capturedAt,
        lastSeenAt: capturedAt
      })
      .onConflictDoUpdate({
        target: [schema.seoPages.tenantId, schema.seoPages.targetId, schema.seoPages.normalizedUrl],
        set: { lastSeenAt: capturedAt, updatedAt: new Date() }
      })
      .returning();
    const page = pageRows[0];
    if (page === undefined) throw new Error("SEO page was not persisted");

    const evidenceFacts = {
      observation_kind: "observed",
      url: document.url,
      status_code: response.status,
      title: document.title,
      description: document.description,
      canonical_url: document.canonicalUrl,
      robots: document.robots,
      headings: document.headings,
      language: document.language,
      word_count: document.wordCount,
      structured_data_count: document.structuredData.length,
      structured_data_errors: document.structuredData.filter((item) => item.error !== null).length,
      render_suggested: document.renderSuggested,
      html_sha256: htmlSha256,
      content_sha256: contentSha256,
      schema_sha256: schemaSha256
    };
    const insertedEvidence = await database
      .insert(schema.evidence)
      .values({
        id: newId(),
        tenantId: context.tenantId,
        source: "crawler",
        sourceRef: document.url,
        capturedAt,
        title: `Coleta SEO de ${document.url}`,
        excerpt: document.title,
        facts: evidenceFacts,
        sha256: evidenceSha256,
        freshUntil: addDays(capturedAt, 14),
        rawImportId: run.id
      })
      .onConflictDoNothing()
      .returning();
    const evidenceRow =
      insertedEvidence[0] ??
      (
        await database
          .select()
          .from(schema.evidence)
          .where(
            and(
              eq(schema.evidence.tenantId, context.tenantId),
              eq(schema.evidence.sha256, evidenceSha256)
            )
          )
          .limit(1)
      )[0];
    if (evidenceRow === undefined) throw new Error("SEO evidence was not persisted");

    await database
      .insert(schema.seoPageSnapshots)
      .values({
        id: newId(),
        tenantId: context.tenantId,
        pageId: page.id,
        analysisRunId: run.id,
        rawImportId: run.id,
        evidenceId: evidenceRow.id,
        observedAt: capturedAt,
        statusCode: response.status,
        mimeType: response.contentType,
        responseHeaders: response.headers,
        title: document.title,
        description: document.description,
        canonicalUrl: document.canonicalUrl,
        robots: [...document.robots],
        headings: document.headings,
        structuredData: document.structuredData,
        language: document.language,
        wordCount: document.wordCount,
        renderSuggested: document.renderSuggested,
        htmlSha256,
        contentSha256,
        schemaSha256,
        renderMode: "http",
        quality: "complete"
      })
      .onConflictDoNothing();
    return { pageId: page.id, evidenceId: evidenceRow.id, document };
  }

  private async executeCapability(
    job: JobEnvelope,
    context: TenantContext,
    database: Database
  ): Promise<JobResult> {
    const runId = requiredString(job.payload.analysis_run_id, "analysis_run_id");
    const capabilityRunId = requiredString(job.payload.capability_run_id, "capability_run_id");
    const capabilityCode = requiredCapability(job.payload.capability_code);
    const rows = await database
      .select()
      .from(schema.seoCapabilityRuns)
      .where(
        and(
          eq(schema.seoCapabilityRuns.tenantId, context.tenantId),
          eq(schema.seoCapabilityRuns.id, capabilityRunId),
          eq(schema.seoCapabilityRuns.analysisRunId, runId)
        )
      )
      .limit(1);
    const capabilityRun = rows[0];
    if (capabilityRun === undefined) throw new Error("SEO capability run is missing");
    if (capabilityRun.status === "succeeded" || capabilityRun.status === "skipped") {
      return {
        status: "completed",
        cursor: null,
        details: { duplicate: true, capability: capabilityCode }
      };
    }
    const definition = capabilityDefinition(capabilityCode);
    if (capabilityRun.attempt >= definition.maxAttempts) {
      await this.finishCapability(database, context, runId, capabilityRunId, "failed", {
        code: "max_attempts"
      });
      return {
        status: "completed",
        cursor: null,
        details: { capability: capabilityCode, failed: true }
      };
    }
    await database
      .update(schema.seoCapabilityRuns)
      .set({
        status: "running",
        attempt: capabilityRun.attempt + 1,
        startedAt: capabilityRun.startedAt ?? new Date(),
        updatedAt: new Date()
      })
      .where(eq(schema.seoCapabilityRuns.id, capabilityRunId));

    try {
      const outcome = await this.runCapability(database, context, runId, capabilityCode);
      if (outcome.skippedReason !== undefined) {
        await database
          .update(schema.seoCapabilityRuns)
          .set({
            status: "skipped",
            skipReason: outcome.skippedReason,
            finishedAt: new Date(),
            updatedAt: new Date()
          })
          .where(eq(schema.seoCapabilityRuns.id, capabilityRunId));
      } else {
        await this.finishCapability(database, context, runId, capabilityRunId, "succeeded", null);
      }
      return {
        status: "completed",
        cursor: null,
        details: {
          capability: capabilityCode,
          findings: outcome.findings.length,
          skipped_reason: outcome.skippedReason ?? null
        }
      };
    } catch (error) {
      if (capabilityRun.attempt + 1 >= definition.maxAttempts) {
        await this.finishCapability(
          database,
          context,
          runId,
          capabilityRunId,
          "failed",
          safeError(error)
        );
        return {
          status: "completed",
          cursor: null,
          details: { capability: capabilityCode, failed: true }
        };
      }
      throw error;
    }
  }

  // Capability routing is explicit to keep every backend workflow deny-by-default.
  // eslint-disable-next-line complexity
  private async runCapability(
    database: Database,
    context: TenantContext,
    runId: string,
    capabilityCode: SeoCapabilityCode
  ): Promise<{
    readonly findings: readonly SeoFindingDraft[];
    readonly skippedReason?: "provider_unavailable";
  }> {
    const snapshotRows = await database
      .select({ snapshot: schema.seoPageSnapshots, page: schema.seoPages })
      .from(schema.seoPageSnapshots)
      .innerJoin(
        schema.seoPages,
        and(
          eq(schema.seoPages.id, schema.seoPageSnapshots.pageId),
          eq(schema.seoPages.tenantId, schema.seoPageSnapshots.tenantId)
        )
      )
      .where(
        and(
          eq(schema.seoPageSnapshots.tenantId, context.tenantId),
          eq(schema.seoPageSnapshots.analysisRunId, runId)
        )
      );
    const first = snapshotRows[0];
    if (first === undefined && coreCapabilities.has(capabilityCode))
      throw new Error("SEO acquisition snapshot is missing");
    if (first === undefined) return { findings: [], skippedReason: "provider_unavailable" };
    const document = documentFromSnapshot(first.snapshot, first.page.normalizedUrl);
    const ruleContext: SeoRuleContext = {
      targetId: first.page.targetId,
      evidenceId: first.snapshot.evidenceId,
      capturedAt: first.snapshot.observedAt.toISOString(),
      source: "crawler",
      coverage: first.snapshot.quality === "complete" ? 1 : 0.5,
      freshness: 1,
      agreement: 1
    };
    let drafts: readonly SeoFindingDraft[] = [];
    if (capabilityCode === "technical") {
      drafts = analyzeTechnicalPage({
        document,
        statusCode: first.snapshot.statusCode,
        critical: first.page.critical,
        context: ruleContext
      });
    } else if (capabilityCode === "content") {
      drafts = analyzeContentPage({ document, context: ruleContext });
    } else if (capabilityCode === "schema") {
      drafts = analyzeStructuredData({ document, context: ruleContext });
    } else if (capabilityCode === "drift") {
      drafts = await this.driftFindings(database, context, runId, first.page.id, ruleContext);
    } else if (!["sitemap", "local", "google"].includes(capabilityCode)) {
      return { findings: [], skippedReason: "provider_unavailable" };
    }

    for (const draft of drafts) {
      await this.persistFinding(database, context, runId, first.page.id, draft);
    }
    return { findings: drafts };
  }

  private async driftFindings(
    database: Database,
    context: TenantContext,
    runId: string,
    pageId: string,
    ruleContext: SeoRuleContext
  ): Promise<readonly SeoFindingDraft[]> {
    const baselineRows = await database
      .select({ baseline: schema.seoBaselines, snapshot: schema.seoPageSnapshots })
      .from(schema.seoBaselines)
      .innerJoin(
        schema.seoPageSnapshots,
        and(
          eq(schema.seoPageSnapshots.analysisRunId, schema.seoBaselines.analysisRunId),
          eq(schema.seoPageSnapshots.pageId, pageId),
          eq(schema.seoPageSnapshots.tenantId, schema.seoBaselines.tenantId)
        )
      )
      .where(
        and(
          eq(schema.seoBaselines.tenantId, context.tenantId),
          inArray(schema.seoBaselines.status, ["active", "provisional"])
        )
      )
      .orderBy(desc(schema.seoBaselines.establishedAt))
      .limit(1);
    const baseline = baselineRows[0];
    if (baseline === undefined) return [];
    const currentRows = await database
      .select()
      .from(schema.seoPageSnapshots)
      .where(
        and(
          eq(schema.seoPageSnapshots.tenantId, context.tenantId),
          eq(schema.seoPageSnapshots.analysisRunId, runId),
          eq(schema.seoPageSnapshots.pageId, pageId)
        )
      )
      .limit(1);
    const current = currentRows[0];
    if (current === undefined) return [];
    const events = comparePageSnapshots(comparable(baseline.snapshot), comparable(current), true);
    return events.map((event) =>
      ruleFinding(ruleContext, {
        code: `SEO-DRIFT-${event.kind.replaceAll("_", "-").toUpperCase()}`,
        category: driftCategory(event.kind),
        severity: event.severity,
        title: driftTitle(event.kind),
        description:
          "O valor observado difere do baseline comparável. Consulte as evidências antes de agir.",
        recommendation:
          "Confirme se a alteração foi intencional e reverta ou aceite o novo baseline conforme o caso.",
        impactBand: event.severity === "critical" || event.severity === "high" ? "high" : "unknown",
        affectedScope: currentRows[0]?.pageId ?? pageId,
        capabilityCode: "drift",
        ruleVersion: "drift-v1"
      })
    );
  }

  private async persistFinding(
    database: Database,
    context: TenantContext,
    runId: string,
    pageId: string,
    draft: SeoFindingDraft
  ): Promise<void> {
    const validated = validateSeoFindingDraft(draft, new Set(draft.evidence_ids));
    const dedupeKey = await sha256Hex(
      `${context.tenantId}|${draft.target_id}|${pageId}|${draft.code}|${draft.origin.rule_version}`
    );
    const existingRows = await database
      .select()
      .from(schema.seoFindings)
      .where(
        and(
          eq(schema.seoFindings.tenantId, context.tenantId),
          eq(schema.seoFindings.dedupeKey, dedupeKey)
        )
      )
      .limit(1);
    const existing = existingRows[0];
    let findingId: string;
    if (existing === undefined) {
      findingId = newId();
      await database.insert(schema.seoFindings).values({
        id: findingId,
        tenantId: context.tenantId,
        targetId: validated.target_id,
        analysisRunId: runId,
        pageId,
        code: validated.code,
        category: validated.category,
        severity: validated.severity,
        title: validated.title,
        description: validated.description,
        confidence: String(validated.confidence.score),
        confidenceCoverage: String(validated.confidence.coverage),
        confidenceFreshness: String(validated.confidence.freshness),
        confidenceAgreement: String(validated.confidence.agreement),
        origin: validated.origin,
        recommendation: validated.recommendation,
        impact: validated.impact,
        status: validated.status,
        dedupeKey,
        ruleVersion: validated.origin.rule_version,
        firstSeenAt: new Date(validated.origin.captured_at),
        lastSeenAt: new Date(validated.origin.captured_at),
        consecutiveCleanRuns: 0
      });
    } else {
      findingId = existing.id;
      await database
        .update(schema.seoFindings)
        .set({
          analysisRunId: runId,
          severity: validated.severity,
          title: validated.title,
          description: validated.description,
          confidence: String(validated.confidence.score),
          confidenceCoverage: String(validated.confidence.coverage),
          confidenceFreshness: String(validated.confidence.freshness),
          confidenceAgreement: String(validated.confidence.agreement),
          origin: validated.origin,
          recommendation: validated.recommendation,
          impact: validated.impact,
          status: existing.status === "resolved" ? "regressed" : existing.status,
          lastSeenAt: new Date(validated.origin.captured_at),
          consecutiveCleanRuns: 0,
          updatedAt: new Date(),
          version: existing.version + 1
        })
        .where(eq(schema.seoFindings.id, findingId));
    }
    const countRows = await database
      .select({ count: sql<number>`count(*)::integer` })
      .from(schema.seoFindingEvidence)
      .where(
        and(
          eq(schema.seoFindingEvidence.tenantId, context.tenantId),
          eq(schema.seoFindingEvidence.findingId, findingId)
        )
      );
    let position = countRows[0]?.count ?? 0;
    for (const evidenceId of validated.evidence_ids) {
      await database
        .insert(schema.seoFindingEvidence)
        .values({
          tenantId: context.tenantId,
          findingId,
          evidenceId,
          position,
          claim: validated.description.slice(0, 500),
          role: "fact"
        })
        .onConflictDoNothing();
      position += 1;
    }
  }

  private async finishCapability(
    database: Database,
    context: TenantContext,
    runId: string,
    capabilityRunId: string,
    status: "succeeded" | "failed",
    error: Readonly<Record<string, string>> | null
  ): Promise<void> {
    await database
      .update(schema.seoCapabilityRuns)
      .set({ status, error, finishedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(schema.seoCapabilityRuns.tenantId, context.tenantId),
          eq(schema.seoCapabilityRuns.id, capabilityRunId)
        )
      );
    const pending = await database
      .select({ count: sql<number>`count(*)::integer` })
      .from(schema.seoCapabilityRuns)
      .where(
        and(
          eq(schema.seoCapabilityRuns.tenantId, context.tenantId),
          eq(schema.seoCapabilityRuns.analysisRunId, runId),
          inArray(schema.seoCapabilityRuns.status, ["queued", "running"])
        )
      );
    if ((pending[0]?.count ?? 0) === 0) await this.emitAnalysisReady(database, context, runId);
  }

  private async aggregate(
    job: JobEnvelope,
    context: TenantContext,
    database: Database
  ): Promise<JobResult> {
    const runId = requiredString(job.payload.analysis_run_id, "analysis_run_id");
    const run = await this.run(database, context.tenantId, runId);
    const capabilities = await database
      .select()
      .from(schema.seoCapabilityRuns)
      .where(
        and(
          eq(schema.seoCapabilityRuns.tenantId, context.tenantId),
          eq(schema.seoCapabilityRuns.analysisRunId, runId)
        )
      );
    const attempted = capabilities.filter((item) => item.status !== "skipped");
    const succeeded = attempted.filter((item) => item.status === "succeeded").length;
    const failed = attempted.filter((item) => item.status === "failed").length;
    const costBlocked = attempted.filter((item) => item.status === "cost_blocked").length;
    const coverage = attempted.length === 0 ? 0 : succeeded / attempted.length;
    const status =
      costBlocked === attempted.length && attempted.length > 0
        ? "cost_blocked"
        : failed > 0 || coverage < 1
          ? "partial"
          : "succeeded";
    const actualCost = capabilities.reduce((sum, item) => sum + Number(item.actualCost), 0);
    await database
      .update(schema.seoAnalysisRuns)
      .set({
        status,
        coverage: String(coverage),
        actualCost: String(actualCost),
        finishedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(schema.seoAnalysisRuns.id, runId));

    await this.maybeSynthesize(database, context, runId, run.targetId);

    if (run.mode === "baseline") {
      await database
        .update(schema.seoBaselines)
        .set({ status: "superseded", supersededAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(schema.seoBaselines.tenantId, context.tenantId),
            eq(schema.seoBaselines.targetId, run.targetId),
            inArray(schema.seoBaselines.status, ["active", "provisional"])
          )
        );
      await database.insert(schema.seoBaselines).values({
        id: newId(),
        tenantId: context.tenantId,
        targetId: run.targetId,
        analysisRunId: runId,
        status: baselineStatus(coverage),
        coverage: String(coverage),
        ruleVersion: "seo-rules-v1",
        configVersion: run.configVersion,
        establishedAt: new Date()
      });
    } else if (await this.hasBaseline(database, context.tenantId, run.targetId)) {
      await this.emit(database, {
        tenantId: context.tenantId,
        aggregateId: runId,
        aggregateType: "seo_analysis",
        eventType: "seo_baseline_ready",
        idempotencyKey: `seo:baseline:${runId}`,
        traceId: context.traceId,
        payload: { analysis_run_id: runId }
      });
    }
    await this.emit(database, {
      tenantId: context.tenantId,
      aggregateId: runId,
      aggregateType: "seo_analysis",
      eventType: "seo_report_requested",
      idempotencyKey: `seo:report:${runId}`,
      traceId: context.traceId,
      payload: { analysis_run_id: runId }
    });
    return {
      status: "completed",
      cursor: null,
      details: { analysis_run_id: runId, status, coverage, succeeded, failed }
    };
  }

  // Every early return is a fail-closed guard for feature, pricing, budget or evidence.
  // eslint-disable-next-line complexity
  private async maybeSynthesize(
    database: Database,
    context: TenantContext,
    runId: string,
    targetId: string
  ): Promise<void> {
    if (!this.config.FEATURE_SEO_DEEPSEEK || this.config.DEEPSEEK_API_KEY === "not-configured")
      return;
    const definition = SEO_PROMPT_REGISTRY.find((item) => item.id === "seo-synthesize/1.0.0");
    if (definition === undefined) return;
    const model = this.config.DEEPSEEK_FLASH_MODEL;
    const priceRows = await database.select().from(schema.providerPriceCatalog)
      .where(sql`${schema.providerPriceCatalog.provider} = 'deepseek'
        and ${schema.providerPriceCatalog.operation} = ${model}
        and ${schema.providerPriceCatalog.effectiveFrom} <= now()
        and (${schema.providerPriceCatalog.effectiveUntil} is null or ${schema.providerPriceCatalog.effectiveUntil} > now())`);
    const inputPrice = priceRows.find((row) => row.unit === "input_token");
    const outputPrice = priceRows.find((row) => row.unit === "output_token");
    if (
      inputPrice === undefined ||
      outputPrice === undefined ||
      inputPrice.currency !== outputPrice.currency
    )
      return;
    const profileRows = await database
      .select()
      .from(schema.seoMonitoringProfiles)
      .where(
        and(
          eq(schema.seoMonitoringProfiles.tenantId, context.tenantId),
          eq(schema.seoMonitoringProfiles.targetId, targetId)
        )
      )
      .limit(1);
    const profile = profileRows[0];
    if (profile?.monthlyBudget === null || profile === undefined) return;
    const evidenceRows = await database
      .select({ evidence: schema.evidence })
      .from(schema.seoFindingEvidence)
      .innerJoin(
        schema.seoFindings,
        and(
          eq(schema.seoFindings.tenantId, schema.seoFindingEvidence.tenantId),
          eq(schema.seoFindings.id, schema.seoFindingEvidence.findingId),
          eq(schema.seoFindings.analysisRunId, runId)
        )
      )
      .innerJoin(
        schema.evidence,
        and(
          eq(schema.evidence.tenantId, schema.seoFindingEvidence.tenantId),
          eq(schema.evidence.id, schema.seoFindingEvidence.evidenceId)
        )
      )
      .where(eq(schema.seoFindingEvidence.tenantId, context.tenantId))
      .limit(50);
    const uniqueEvidence = new Map(evidenceRows.map((row) => [row.evidence.id, row.evidence]));
    if (uniqueEvidence.size === 0) return;
    const evidence = [...uniqueEvidence.values()].map((item) => ({
      id: item.id,
      source: item.source,
      capturedAt: item.capturedAt.toISOString(),
      facts: isRecord(item.facts) ? item.facts : {},
      excerpt: item.excerpt
    }));
    const messages = buildSeoPrompt({
      definition,
      task: "Sintetize os achados desta execução sem alterar severidade, confiança ou status.",
      evidence
    });
    const estimatedInputTokens = Math.min(
      definition.maxInputTokens,
      Math.ceil(JSON.stringify(messages).length / 3)
    );
    const estimatedCost =
      estimatedInputTokens * Number(inputPrice.unitPrice) +
      definition.maxOutputTokens * Number(outputPrice.unitPrice);
    const usageRows = await database
      .select({
        total: sql<number>`coalesce(sum(${schema.usageEvents.cost}), 0)::double precision`
      })
      .from(schema.usageEvents).where(sql`${schema.usageEvents.tenantId} = ${context.tenantId}
        and ${schema.usageEvents.provider} = 'deepseek'
        and ${schema.usageEvents.occurredAt} >= date_trunc('month', now())`);
    const reservedRows = await database
      .select({
        total: sql<number>`coalesce(sum(${schema.costReservations.estimatedCost}), 0)::double precision`
      })
      .from(schema.costReservations)
      .where(sql`${schema.costReservations.tenantId} = ${context.tenantId}
        and ${schema.costReservations.provider} = 'deepseek'
        and ${schema.costReservations.status} = 'reserved'
        and ${schema.costReservations.expiresAt} > now()`);
    const budget = evaluateBudget({
      hardLimit: Number(profile.monthlyBudget),
      spent: usageRows[0]?.total ?? 0,
      reserved: reservedRows[0]?.total ?? 0,
      estimatedCost,
      essentialOverride: false
    });
    if (!budget.allowed) return;
    const reservationId = newId();
    const idempotencyKey = `seo:deepseek:${runId}:${definition.id}`;
    const inserted = await database
      .insert(schema.costReservations)
      .values({
        id: reservationId,
        tenantId: context.tenantId,
        provider: "deepseek",
        operation: model,
        idempotencyKey,
        status: "reserved",
        estimatedCost: String(estimatedCost),
        currency: inputPrice.currency,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        metadata: { analysis_run_id: runId, prompt_version: definition.id }
      })
      .onConflictDoNothing()
      .returning({ id: schema.costReservations.id });
    if (inserted.length === 0) return;
    const aiRunId = newId();
    const startedAt = Date.now();
    const inputSha256 = await sha256Hex(JSON.stringify(messages));
    try {
      const gateway = new DeepSeekHttpGateway({
        apiKey: this.config.DEEPSEEK_API_KEY,
        baseUrl: this.config.DEEPSEEK_BASE_URL
      });
      const result = await gateway.complete({
        model,
        messages,
        maxOutputTokens: definition.maxOutputTokens,
        timeoutMs: 45_000,
        pseudonymousUserId: pseudonymousDeepSeekUserId(
          context.tenantId,
          this.config.INTERNAL_WORKER_SECRET
        )
      });
      const verified = verifySeoAiOutput(result.output, new Set(uniqueEvidence.keys()));
      const actualCost =
        result.usage.inputTokens * Number(inputPrice.unitPrice) +
        result.usage.outputTokens * Number(outputPrice.unitPrice);
      await database.insert(schema.aiRuns).values({
        id: aiRunId,
        tenantId: context.tenantId,
        useCase: "seo_synthesize",
        provider: "deepseek",
        model: result.model,
        promptVersion: definition.id,
        inputSha256,
        status: verified.output === null ? "invalid" : "succeeded",
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        cost: String(actualCost),
        latencyMs: Date.now() - startedAt,
        output: verified.output,
        validationErrors: verified.errors,
        requestedBy: context.systemActor ? null : context.userId
      });
      await database.insert(schema.aiRunEvidence).values(
        evidence.map((item, position) => ({
          tenantId: context.tenantId,
          aiRunId,
          evidenceId: item.id,
          position,
          purpose: "seo_synthesis"
        }))
      );
      await database.insert(schema.usageEvents).values({
        id: newId(),
        tenantId: context.tenantId,
        provider: "deepseek",
        operation: model,
        requestId: result.providerRequestId,
        quantity: String(result.usage.inputTokens + result.usage.outputTokens),
        unit: "token",
        cost: String(actualCost),
        currency: inputPrice.currency,
        occurredAt: new Date(),
        metadata: {
          analysis_run_id: runId,
          cache_hit_tokens: result.usage.cacheHitTokens,
          cache_miss_tokens: result.usage.cacheMissTokens
        }
      });
      await database
        .update(schema.costReservations)
        .set({
          status: "reconciled",
          actualCost: String(actualCost),
          reconciledAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(schema.costReservations.id, reservationId));
      await database
        .update(schema.seoAnalysisRuns)
        .set({
          actualCost: sql`${schema.seoAnalysisRuns.actualCost} + ${actualCost}`,
          updatedAt: new Date()
        })
        .where(
          and(
            eq(schema.seoAnalysisRuns.tenantId, context.tenantId),
            eq(schema.seoAnalysisRuns.id, runId)
          )
        );
    } catch (error) {
      await database.insert(schema.aiRuns).values({
        id: aiRunId,
        tenantId: context.tenantId,
        useCase: "seo_synthesize",
        provider: "deepseek",
        model,
        promptVersion: definition.id,
        inputSha256,
        status: "failed",
        latencyMs: Date.now() - startedAt,
        validationErrors: safeError(error),
        requestedBy: context.systemActor ? null : context.userId
      });
      await database
        .update(schema.costReservations)
        .set({
          status: "released",
          actualCost: "0",
          reconciledAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(schema.costReservations.id, reservationId));
    }
  }

  private async compareBaseline(
    job: JobEnvelope,
    context: TenantContext,
    database: Database
  ): Promise<JobResult> {
    const runId = requiredString(job.payload.analysis_run_id, "analysis_run_id");
    const run = await this.run(database, context.tenantId, runId);
    const baselineRows = await database
      .select()
      .from(schema.seoBaselines)
      .where(
        and(
          eq(schema.seoBaselines.tenantId, context.tenantId),
          eq(schema.seoBaselines.targetId, run.targetId),
          inArray(schema.seoBaselines.status, ["active", "provisional"])
        )
      )
      .orderBy(desc(schema.seoBaselines.establishedAt))
      .limit(1);
    const baseline = baselineRows[0];
    if (baseline === undefined) {
      return { status: "completed", cursor: null, details: { skipped: "missing_baseline" } };
    }
    const baselineSnapshots = await database
      .select()
      .from(schema.seoPageSnapshots)
      .where(
        and(
          eq(schema.seoPageSnapshots.tenantId, context.tenantId),
          eq(schema.seoPageSnapshots.analysisRunId, baseline.analysisRunId)
        )
      );
    const currentSnapshots = await database
      .select()
      .from(schema.seoPageSnapshots)
      .where(
        and(
          eq(schema.seoPageSnapshots.tenantId, context.tenantId),
          eq(schema.seoPageSnapshots.analysisRunId, runId)
        )
      );
    const baselineByPage = new Map(
      baselineSnapshots.map((snapshot) => [snapshot.pageId, snapshot])
    );
    let compared = 0;
    let changes = 0;
    for (const current of currentSnapshots) {
      const previous = baselineByPage.get(current.pageId);
      if (previous === undefined) continue;
      compared += 1;
      changes += comparePageSnapshots(comparable(previous), comparable(current), true).length;
    }
    const comparableCoverage =
      currentSnapshots.length === 0 ? 0 : compared / currentSnapshots.length;
    await database
      .insert(schema.seoComparisons)
      .values({
        id: newId(),
        tenantId: context.tenantId,
        targetId: run.targetId,
        baselineId: baseline.id,
        currentRunId: runId,
        status:
          comparableCoverage === 1
            ? "complete"
            : comparableCoverage === 0
              ? "incomparable"
              : "partial",
        summary: { compared_pages: compared, drift_events: changes },
        comparableCoverage: String(comparableCoverage),
        comparedAt: new Date()
      })
      .onConflictDoNothing();
    return {
      status: "completed",
      cursor: null,
      details: {
        compared_pages: compared,
        drift_events: changes,
        comparable_coverage: comparableCoverage
      }
    };
  }

  private async renderReport(
    job: JobEnvelope,
    context: TenantContext,
    database: Database
  ): Promise<JobResult> {
    const runId = requiredString(job.payload.analysis_run_id, "analysis_run_id");
    const run = await this.run(database, context.tenantId, runId);
    if (run.reportHtmlKey !== null) {
      return {
        status: "completed",
        cursor: null,
        details: { analysis_run_id: runId, html_object_key: run.reportHtmlKey, duplicate: true }
      };
    }
    const targetRows = await database
      .select()
      .from(schema.seoTargets)
      .where(
        and(
          eq(schema.seoTargets.tenantId, context.tenantId),
          eq(schema.seoTargets.id, run.targetId)
        )
      )
      .limit(1);
    const target = targetRows[0];
    if (target === undefined) throw new Error("SEO report target is missing");
    const findings = await database
      .select()
      .from(schema.seoFindings)
      .where(
        and(
          eq(schema.seoFindings.tenantId, context.tenantId),
          eq(schema.seoFindings.analysisRunId, runId)
        )
      )
      .orderBy(schema.seoFindings.severity, schema.seoFindings.code);
    const capabilityRuns = await database
      .select()
      .from(schema.seoCapabilityRuns)
      .where(
        and(
          eq(schema.seoCapabilityRuns.tenantId, context.tenantId),
          eq(schema.seoCapabilityRuns.analysisRunId, runId)
        )
      )
      .orderBy(schema.seoCapabilityRuns.capabilityCode);
    const html = renderSeoHtml({ run, target, findings, capabilityRuns });
    const artifact = await this.artifacts.putText({
      tenantId: context.tenantId,
      category: "seo",
      artifactId: runId,
      value: html,
      bucket: "reports",
      contentType: "text/html"
    });
    await database
      .update(schema.seoAnalysisRuns)
      .set({ reportHtmlKey: artifact.objectKey, updatedAt: new Date() })
      .where(
        and(
          eq(schema.seoAnalysisRuns.tenantId, context.tenantId),
          eq(schema.seoAnalysisRuns.id, runId)
        )
      );
    return {
      status: "completed",
      cursor: null,
      details: {
        analysis_run_id: runId,
        html_canonical: true,
        html_object_key: artifact.objectKey,
        html_sha256: await sha256Hex(html),
        pdf_derived: false
      }
    };
  }

  private async availableIntegrations(
    database: Database,
    tenantId: string
  ): Promise<ReadonlySet<string>> {
    if (!this.config.FEATURE_SEO_REAL_PROVIDERS) return new Set();
    const rows = await database
      .select({ provider: schema.integrationConnections.provider })
      .from(schema.integrationConnections)
      .where(
        and(
          eq(schema.integrationConnections.tenantId, tenantId),
          eq(schema.integrationConnections.status, "active")
        )
      );
    const integrations = new Set(rows.map((row) => row.provider));
    if (integrations.has("search_console")) integrations.add("performance");
    if (
      integrations.has("dataforseo") &&
      this.config.DATAFORSEO_LOGIN !== "not-configured" &&
      this.config.DATAFORSEO_PASSWORD !== "not-configured"
    ) {
      integrations.add("serp");
      integrations.add("backlink");
      integrations.add("ai_visibility");
    }
    if (this.config.FIRECRAWL_API_KEY !== "not-configured") integrations.add("renderer");
    return integrations;
  }

  private async countActiveKeywords(
    database: Database,
    tenantId: string,
    targetId: string
  ): Promise<number> {
    const rows = await database
      .select({ count: sql<number>`count(*)::integer` })
      .from(schema.seoKeywords)
      .where(
        and(
          eq(schema.seoKeywords.tenantId, tenantId),
          eq(schema.seoKeywords.targetId, targetId),
          eq(schema.seoKeywords.active, true)
        )
      );
    return rows[0]?.count ?? 0;
  }

  private async countActiveCompetitors(
    database: Database,
    tenantId: string,
    targetId: string
  ): Promise<number> {
    const rows = await database
      .select({ count: sql<number>`count(*)::integer` })
      .from(schema.seoCompetitors)
      .where(
        and(
          eq(schema.seoCompetitors.tenantId, tenantId),
          eq(schema.seoCompetitors.targetId, targetId),
          eq(schema.seoCompetitors.active, true)
        )
      );
    return rows[0]?.count ?? 0;
  }

  private async hasBaseline(
    database: Database,
    tenantId: string,
    targetId: string
  ): Promise<boolean> {
    const rows = await database
      .select({ id: schema.seoBaselines.id })
      .from(schema.seoBaselines)
      .where(
        and(
          eq(schema.seoBaselines.tenantId, tenantId),
          eq(schema.seoBaselines.targetId, targetId),
          inArray(schema.seoBaselines.status, ["active", "provisional"])
        )
      )
      .limit(1);
    return rows.length > 0;
  }

  private async run(
    database: Database,
    tenantId: string,
    runId: string
  ): Promise<typeof schema.seoAnalysisRuns.$inferSelect> {
    const rows = await database
      .select()
      .from(schema.seoAnalysisRuns)
      .where(
        and(eq(schema.seoAnalysisRuns.tenantId, tenantId), eq(schema.seoAnalysisRuns.id, runId))
      )
      .limit(1);
    const run = rows[0];
    if (run === undefined) throw new Error("SEO analysis run is missing");
    return run;
  }

  private async capabilityRunId(
    database: Database,
    tenantId: string,
    runId: string,
    code: SeoCapabilityCode
  ): Promise<string> {
    const rows = await database
      .select({ id: schema.seoCapabilityRuns.id })
      .from(schema.seoCapabilityRuns)
      .where(
        and(
          eq(schema.seoCapabilityRuns.tenantId, tenantId),
          eq(schema.seoCapabilityRuns.analysisRunId, runId),
          eq(schema.seoCapabilityRuns.capabilityCode, code)
        )
      )
      .limit(1);
    if (rows[0] === undefined) throw new Error("SEO capability run is missing after insert");
    return rows[0].id;
  }

  private emitAnalysisReady(
    database: Database,
    context: TenantContext,
    runId: string
  ): Promise<void> {
    return this.emit(database, {
      tenantId: context.tenantId,
      aggregateId: runId,
      aggregateType: "seo_analysis",
      eventType: "seo_analysis_ready",
      idempotencyKey: `seo:aggregate:${runId}`,
      traceId: context.traceId,
      payload: { analysis_run_id: runId }
    });
  }

  private async emit(
    database: Database,
    input: {
      readonly tenantId: string;
      readonly aggregateType: string;
      readonly aggregateId: string;
      readonly eventType: string;
      readonly idempotencyKey: string;
      readonly traceId: string;
      readonly payload: Readonly<Record<string, unknown>>;
    }
  ): Promise<void> {
    await database
      .insert(schema.outboxEvents)
      .values({
        id: newId(),
        tenantId: input.tenantId,
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        eventType: input.eventType,
        schemaVersion: "1",
        idempotencyKey: input.idempotencyKey,
        payload: input.payload,
        traceId: input.traceId
      })
      .onConflictDoNothing();
  }
}

function documentFromSnapshot(
  snapshot: typeof schema.seoPageSnapshots.$inferSelect,
  url: string
): ParsedHtmlDocument {
  const headings = asHeadings(snapshot.headings);
  const structuredData = Array.isArray(snapshot.structuredData)
    ? snapshot.structuredData.map((item) => asStructuredData(item))
    : [];
  return {
    url,
    title: snapshot.title,
    description: snapshot.description,
    canonicalUrl: snapshot.canonicalUrl,
    robots: snapshot.robots,
    headings,
    structuredData,
    links: [],
    language: snapshot.language,
    text: snapshot.wordCount === 0 ? "" : "content-present",
    wordCount: snapshot.wordCount,
    renderSuggested: snapshot.renderSuggested
  };
}

function comparable(
  snapshot: typeof schema.seoPageSnapshots.$inferSelect
): SeoComparablePageSnapshot {
  return {
    url: snapshot.pageId,
    statusCode: snapshot.statusCode,
    title: snapshot.title,
    description: snapshot.description,
    canonicalUrl: snapshot.canonicalUrl,
    robots: snapshot.robots,
    h1: asHeadings(snapshot.headings).h1,
    contentSha256: snapshot.contentSha256,
    schemaSha256: snapshot.schemaSha256,
    structuredDataCount: Array.isArray(snapshot.structuredData) ? snapshot.structuredData.length : 0
  };
}

function asHeadings(value: unknown): Readonly<Record<"h1" | "h2" | "h3", readonly string[]>> {
  const record = isRecord(value) ? value : {};
  return { h1: stringArray(record.h1), h2: stringArray(record.h2), h3: stringArray(record.h3) };
}

function asStructuredData(value: unknown): {
  readonly value: unknown;
  readonly error: string | null;
} {
  if (!isRecord(value)) return { value: null, error: "invalid_snapshot" };
  return {
    value: value.value ?? null,
    error: typeof value.error === "string" ? value.error : null
  };
}

function dueCapabilitySet(job: JobEnvelope, mode: SeoAnalysisMode): ReadonlySet<SeoCapabilityCode> {
  if (mode === "baseline" || mode === "on_demand") return new Set(allCapabilityCodes());
  if (mode === "post_deploy") {
    return new Set(["technical", "content", "schema", "sitemap", "performance", "visual", "drift"]);
  }
  const due = new Set<SeoCapabilityCode>(["technical", "sitemap"]);
  if (job.payload.due_weekly === true) {
    for (const code of ["content", "schema", "performance", "local", "maps", "drift"] as const)
      due.add(code);
  }
  if (job.payload.due_monthly === true) for (const code of allCapabilityCodes()) due.add(code);
  return due;
}

function allCapabilityCodes(): readonly SeoCapabilityCode[] {
  return [
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
  ];
}

function crawlPolicy(value: unknown): {
  readonly timeoutMs: number;
  readonly maxRedirects: number;
} {
  const record = isRecord(value) ? value : {};
  return {
    timeoutMs: boundedNumber(record.timeout_ms, 30_000, 1_000, 60_000),
    maxRedirects: boundedNumber(record.max_redirects, 3, 0, 5)
  };
}

function driftCategory(kind: string): "technical" | "content" | "schema" {
  if (kind.startsWith("schema")) return "schema";
  if (
    kind.startsWith("content") ||
    kind.startsWith("title") ||
    kind.startsWith("description") ||
    kind.startsWith("h1")
  )
    return "content";
  return "technical";
}

function driftTitle(kind: string): string {
  return `Regressão detectada: ${kind.replaceAll("_", " ")}`;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`Missing ${field}`);
  return value;
}

function requiredCapability(value: unknown): SeoCapabilityCode {
  const normalized = requiredString(value, "capability_code");
  if (!allCapabilityCodes().includes(normalized as SeoCapabilityCode)) {
    throw new Error(`Unsupported SEO capability: ${normalized}`);
  }
  return normalized as SeoCapabilityCode;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function readBoolean(value: unknown, key: string): boolean {
  return isRecord(value) && value[key] === true;
}

function boundedNumber(value: unknown, fallback: number, minimum: number, maximum: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, value))
    : fallback;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function safeError(error: unknown): Readonly<Record<string, string>> {
  return error instanceof Error
    ? { name: error.name, message: error.message }
    : { name: "UnknownError", message: "Unknown SEO capability failure" };
}

function renderSeoHtml(input: {
  readonly run: typeof schema.seoAnalysisRuns.$inferSelect;
  readonly target: typeof schema.seoTargets.$inferSelect;
  readonly findings: readonly (typeof schema.seoFindings.$inferSelect)[];
  readonly capabilityRuns: readonly (typeof schema.seoCapabilityRuns.$inferSelect)[];
}): string {
  const findingRows =
    input.findings.length === 0
      ? '<tr><td colspan="5">Nenhum achado evidenciado nesta execução.</td></tr>'
      : input.findings
          .map(
            (finding) => `
      <tr>
        <td><code>${escapeHtml(finding.code)}</code></td>
        <td>${escapeHtml(finding.category)}</td>
        <td>${escapeHtml(finding.severity)}</td>
        <td>${escapeHtml(finding.title)}</td>
        <td>${escapeHtml(finding.status)}</td>
      </tr>`
          )
          .join("");
  const capabilityRows = input.capabilityRuns
    .map(
      (capability) => `
      <tr>
        <td>${escapeHtml(capability.capabilityCode)}</td>
        <td>${escapeHtml(capability.status)}</td>
        <td>${escapeHtml(capability.skipReason ?? "â€”")}</td>
        <td>${String(capability.attempt)}</td>
      </tr>`
    )
    .join("");
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Relatório SEO — ${escapeHtml(input.target.normalizedOrigin)}</title>
  <style>body{font:15px system-ui,sans-serif;color:#171717;margin:40px;line-height:1.5}h1,h2{line-height:1.2}table{border-collapse:collapse;width:100%;margin:16px 0 32px}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f5f5f5}.meta{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.meta div{background:#f7f7f7;padding:12px;border-radius:8px}code{font-size:12px}</style>
</head>
<body>
  <header><p>Growth Manager</p><h1>Monitoramento SEO</h1><p>${escapeHtml(input.target.normalizedOrigin)}</p></header>
  <section class="meta">
    <div><strong>Status</strong><br>${escapeHtml(input.run.status)}</div>
    <div><strong>Cobertura</strong><br>${String(Math.round(Number(input.run.coverage) * 100))}%</div>
    <div><strong>Capturado em</strong><br>${escapeHtml(input.run.createdAt.toISOString())}</div>
  </section>
  <h2>Capacidades</h2>
  <table><thead><tr><th>Capacidade</th><th>Status</th><th>Motivo do skip</th><th>Tentativas</th></tr></thead><tbody>${capabilityRows}</tbody></table>
  <h2>Achados</h2>
  <table><thead><tr><th>Código</th><th>Categoria</th><th>Severidade</th><th>Achado</th><th>Status</th></tr></thead><tbody>${findingRows}</tbody></table>
  <footer><p>Relatório HTML canônico. Métricas ausentes não são representadas como zero. Cada achado possui evidências verificáveis no Growth Manager.</p></footer>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
