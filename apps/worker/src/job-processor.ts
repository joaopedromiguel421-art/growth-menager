import { createHash } from "node:crypto";
import type { JobEnvelope } from "@growth-manager/contracts";
import { parseConfig, type AppConfig } from "@growth-manager/config";
import { and, eq, schema, sql, type Database } from "@growth-manager/database";
import {
  FakeProviderAdapter,
  createLocalPost,
  replyToReview,
  ResendEmailAdapter,
  type ProviderAdapter,
  type ProviderName
} from "@growth-manager/integrations";
import type { TenantContext } from "@growth-manager/domain";
import {
  accessTokenFor,
  activeConnection,
  syncGoogleProvider,
  syncGoogleReviews,
  type SyncableProvider
} from "./google-sync.js";
import { generateRecommendations } from "./recommendation-engine.js";
import { SeoAnalysisProcessor } from "./seo-analysis-processor.js";
import { ReportProcessor } from "./report-processor.js";

export interface JobResult {
  readonly status: "completed" | "continued";
  readonly cursor: Readonly<Record<string, unknown>> | null;
  readonly details: Readonly<Record<string, unknown>>;
}

const externalWriteJobs = new Set<JobEnvelope["job_type"]>(["publish_reply", "publish_content"]);
const realSyncProviders = new Set<string>(["google_business", "search_console", "ga4"]);

export class JobProcessor {
  private readonly seo: SeoAnalysisProcessor;
  private readonly reports: ReportProcessor;
  private readonly providers: ReadonlyMap<ProviderName, ProviderAdapter> = new Map(
    (
      [
        "google_business",
        "search_console",
        "ga4",
        "instagram",
        "dataforseo",
        "deepseek"
      ] satisfies readonly ProviderName[]
    ).map((name) => [name, new FakeProviderAdapter(name)])
  );

  public constructor(private readonly config: AppConfig = parseConfig(process.env)) {
    this.seo = new SeoAnalysisProcessor(config);
    this.reports = new ReportProcessor(config);
  }

  public async process(
    job: JobEnvelope,
    context: TenantContext,
    database: Database
  ): Promise<JobResult> {
    if (job.job_type.startsWith("seo_")) {
      return this.seo.process(job, context, database);
    }
    if (job.job_type === "sync") {
      return this.processSync(job, context, database);
    }
    if (job.job_type === "render_report") {
      return this.reports.render(job, context, database);
    }
    if (job.job_type === "deliver_report") {
      return this.deliverReport(job, context, database);
    }
    if (externalWriteJobs.has(job.job_type)) {
      return this.processExternalWrite(job, context, database);
    }
    return Promise.resolve({
      status: "completed",
      cursor: null,
      details: { handled: job.job_type, request_id: context.requestId }
    });
  }

  private async processSync(
    job: JobEnvelope,
    context: TenantContext,
    database: Database
  ): Promise<JobResult> {
    // app.relay_outbox maps unrecognised event types to 'sync', so domain events
    // such as task_created arrive here carrying no provider. Failing them would
    // burn all five attempts and dead-letter a notification; acknowledge instead.
    if (typeof job.payload.provider !== "string") {
      return {
        status: "completed",
        cursor: null,
        details: { skipped: job.job_type, reason: "no_provider", request_id: context.requestId }
      };
    }

    const provider = job.payload.provider;
    if (this.config.FEATURE_REAL_PROVIDERS && realSyncProviders.has(provider)) {
      const outcome = await syncGoogleProvider({
        database,
        context,
        config: this.config,
        provider: provider as SyncableProvider
      });

      // Reviews live outside metric_snapshots and only google_business carries
      // them, so this rides the same sync trigger without joining the metrics loop.
      const reviewOutcome =
        provider === "google_business"
          ? await syncGoogleReviews({ database, context, config: this.config })
          : null;

      // Runs in the same transaction as the sync: metrics without the priorities
      // derived from them would leave the dashboard empty until the next run.
      const engine =
        provider === "ga4"
          ? { created: 0, updated: 0 }
          : await generateRecommendations({
              database,
              context,
              provider: provider as "google_business" | "search_console"
            });

      return {
        status: "completed",
        cursor: null,
        details: {
          rows: outcome.recordsRead,
          written: outcome.recordsWritten,
          provider,
          recommendations_created: engine.created,
          recommendations_updated: engine.updated,
          ...(reviewOutcome === null
            ? {}
            : {
                reviews_read: reviewOutcome.recordsRead,
                reviews_written: reviewOutcome.recordsWritten,
                reviews_escalated: reviewOutcome.escalated
              })
        }
      };
    }

    // Providers without a real adapter still exercise the queue so the pipeline can
    // be verified end to end before their credentials exist.
    const adapter = this.provider(job.payload.provider);
    const result = await adapter.read({
      tenantId: context.tenantId,
      requestId: context.requestId,
      idempotencyKey: job.idempotency_key,
      operation:
        typeof job.payload.operation === "string" ? job.payload.operation : "incremental_sync",
      cursor: job.cursor,
      payload: job.payload
    });
    return {
      status: result.nextCursor === null ? "completed" : "continued",
      cursor: result.nextCursor,
      details: {
        rows: result.data.length,
        provider_request_id: result.providerRequestId,
        cost: result.cost
      }
    };
  }

  private async processExternalWrite(
    job: JobEnvelope,
    context: TenantContext,
    database: Database
  ): Promise<JobResult> {
    if (job.job_type === "publish_content") {
      return this.publishContent(job, context, database);
    }
    if (
      this.config.FEATURE_REAL_PROVIDERS &&
      job.job_type === "publish_reply" &&
      job.payload.provider === "google_business"
    ) {
      return this.publishReviewReply(job, context, database);
    }

    const provider = this.provider(job.payload.provider);
    const result = await provider.write({
      tenantId: context.tenantId,
      requestId: context.requestId,
      idempotencyKey: job.idempotency_key,
      operation: job.job_type,
      cursor: null,
      payload: job.payload
    });
    return {
      status: "completed",
      cursor: null,
      details: { provider_request_id: result.providerRequestId }
    };
  }

  private async publishContent(
    job: JobEnvelope,
    context: TenantContext,
    database: Database
  ): Promise<JobResult> {
    const publicationId = job.payload.publication_id;
    if (typeof publicationId !== "string")
      throw new Error("publish_content job is missing publication_id");
    const rows = await database
      .select({
        publication: schema.publications,
        body: schema.contentVersions.body,
        propertyExternalId: schema.integrationProperties.externalId,
        connectionId: schema.integrationProperties.connectionId
      })
      .from(schema.publications)
      .innerJoin(
        schema.contentVersions,
        and(
          eq(schema.contentVersions.contentItemId, schema.publications.contentItemId),
          eq(schema.contentVersions.version, schema.publications.contentVersion)
        )
      )
      .innerJoin(
        schema.integrationProperties,
        eq(schema.integrationProperties.id, schema.publications.propertyId)
      )
      .where(
        and(
          eq(schema.publications.id, publicationId),
          eq(schema.publications.tenantId, context.tenantId)
        )
      )
      .limit(1);
    const record = rows[0];
    if (record === undefined) throw new Error(`Publication ${publicationId} not found`);
    const terminal = publicationTerminalResult(publicationId, record.publication.status);
    if (terminal !== null) return terminal;

    const startedAt = new Date();
    const attemptRows = await database
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.publicationAttempts)
      .where(eq(schema.publicationAttempts.publicationId, publicationId));
    const attempt = (attemptRows[0]?.count ?? 0) + 1;
    await database
      .update(schema.publications)
      .set({
        status: "publishing",
        lastAttemptAt: startedAt,
        updatedAt: startedAt,
        version: sql`${schema.publications.version} + 1`
      })
      .where(eq(schema.publications.id, publicationId));

    if (!realPublicationEnabled(this.config, record.publication.provider)) {
      await this.recordPublicationFailure(
        database,
        context,
        publicationId,
        attempt,
        record.body,
        startedAt,
        "provider_disabled"
      );
      return {
        status: "completed",
        cursor: null,
        details: {
          publication_id: publicationId,
          published: false,
          failure_code: "provider_disabled"
        }
      };
    }

    try {
      const connection = await activeConnection(database, context, "google_business");
      if (connection.id !== record.connectionId)
        throw new Error("Publication property is not part of the active connection");
      const accessToken = await accessTokenFor(database, connection.id, {
        clientId: this.config.GOOGLE_CLIENT_ID,
        clientSecret: this.config.GOOGLE_CLIENT_SECRET,
        redirectUri: `${this.config.API_BASE_URL}/v1/integrations/google_business/callback`
      });
      const result = await createLocalPost({
        accessToken,
        locationExternalId: record.propertyExternalId,
        summary: record.body
      });
      const finishedAt = new Date();
      await database.insert(schema.publicationAttempts).values({
        id: crypto.randomUUID(),
        tenantId: context.tenantId,
        publicationId,
        attempt,
        requestSha256: createHash("sha256").update(record.body).digest("hex"),
        providerRequestId: result.externalId,
        startedAt,
        finishedAt,
        outcome: "published"
      });
      await database
        .update(schema.publications)
        .set({
          status: "published",
          externalId: result.externalId,
          publishedAt: finishedAt,
          failureCode: null,
          updatedAt: finishedAt,
          version: sql`${schema.publications.version} + 1`
        })
        .where(eq(schema.publications.id, publicationId));
      await database
        .update(schema.contentItems)
        .set({
          status: "published",
          updatedAt: finishedAt,
          version: sql`${schema.contentItems.version} + 1`
        })
        .where(eq(schema.contentItems.id, record.publication.contentItemId));
      return {
        status: "completed",
        cursor: null,
        details: { publication_id: publicationId, published: true, external_id: result.externalId }
      };
    } catch (error) {
      await this.recordPublicationFailure(
        database,
        context,
        publicationId,
        attempt,
        record.body,
        startedAt,
        publicationFailureCode(error)
      );
      return {
        status: "completed",
        cursor: null,
        details: { publication_id: publicationId, published: false, reconciliation_required: true }
      };
    }
  }

  private async deliverReport(
    job: JobEnvelope,
    context: TenantContext,
    database: Database
  ): Promise<JobResult> {
    const deliveryId = job.payload.delivery_id;
    if (typeof deliveryId !== "string")
      throw new Error("deliver_report job is missing delivery_id");
    const rows = await database
      .select({
        delivery: schema.reportDeliveries,
        recipient: schema.reportRecipients,
        report: schema.reports,
        snapshot: schema.reportSnapshots,
        tenantName: schema.tenants.name
      })
      .from(schema.reportDeliveries)
      .innerJoin(
        schema.reportRecipients,
        eq(schema.reportRecipients.id, schema.reportDeliveries.recipientId)
      )
      .innerJoin(schema.reports, eq(schema.reports.id, schema.reportDeliveries.reportId))
      .innerJoin(
        schema.reportSnapshots,
        and(
          eq(schema.reportSnapshots.reportId, schema.reportDeliveries.reportId),
          eq(schema.reportSnapshots.version, schema.reportDeliveries.snapshotVersion)
        )
      )
      .innerJoin(schema.tenants, eq(schema.tenants.id, schema.reportDeliveries.tenantId))
      .where(
        and(
          eq(schema.reportDeliveries.id, deliveryId),
          eq(schema.reportDeliveries.tenantId, context.tenantId)
        )
      )
      .limit(1);
    const record = rows[0];
    if (record === undefined) throw new Error(`Report delivery ${deliveryId} not found`);
    if (["sent", "delivered", "opened"].includes(record.delivery.status)) {
      return {
        status: "completed",
        cursor: null,
        details: { delivery_id: deliveryId, duplicate: true }
      };
    }
    const reportUrl = await this.signReport(
      record.snapshot.pdfObjectKey ?? record.snapshot.htmlObjectKey,
      604800
    );
    const receipt = await new ResendEmailAdapter(this.config.RESEND_API_KEY).send({
      from: this.config.RESEND_FROM_EMAIL,
      to: [record.recipient.email],
      subject: `Relatório de resultados — ${record.tenantName}`,
      html: `<p>Olá${record.recipient.name === null ? "" : `, ${escapeEmailHtml(record.recipient.name)}`}.</p><p>O relatório de ${record.report.periodStart} a ${record.report.periodEnd} está pronto.</p><p><a href="${escapeEmailHtml(reportUrl)}">Abrir relatório</a></p><p>O link expira em 7 dias.</p>`,
      text: `Relatório de ${record.report.periodStart} a ${record.report.periodEnd}: ${reportUrl}`,
      idempotencyKey: record.delivery.idempotencyKey
    });
    const now = new Date();
    await database
      .update(schema.reportDeliveries)
      .set({
        status: "sent",
        providerMessageId: receipt.providerMessageId,
        attempt: record.delivery.attempt + 1,
        sentAt: now,
        errorCode: null,
        updatedAt: now,
        version: sql`${schema.reportDeliveries.version} + 1`
      })
      .where(eq(schema.reportDeliveries.id, deliveryId));
    await database
      .update(schema.reports)
      .set({
        status: "published",
        publishedAt: now,
        updatedAt: now,
        version: sql`${schema.reports.version} + 1`
      })
      .where(eq(schema.reports.id, record.report.id));
    return { status: "completed", cursor: null, details: { delivery_id: deliveryId, sent: true } };
  }

  private async signReport(objectKey: string, expiresIn: number): Promise<string> {
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
    if (!response.ok)
      throw new Error(`Report link signing failed with status ${String(response.status)}`);
    const body: unknown = await response.json();
    if (!hasSignedUrl(body)) throw new Error("Report link signing returned an invalid response");
    return new URL(body.signedURL, this.config.SUPABASE_URL).toString();
  }

  private async recordPublicationFailure(
    database: Database,
    context: TenantContext,
    publicationId: string,
    attempt: number,
    body: string,
    startedAt: Date,
    failureCode: string
  ): Promise<void> {
    const finishedAt = new Date();
    await database.insert(schema.publicationAttempts).values({
      id: crypto.randomUUID(),
      tenantId: context.tenantId,
      publicationId,
      attempt,
      requestSha256: createHash("sha256").update(body).digest("hex"),
      startedAt,
      finishedAt,
      outcome: "failed",
      error: { code: failureCode }
    });
    await database
      .update(schema.publications)
      .set({
        status: "failed",
        failureCode,
        updatedAt: finishedAt,
        version: sql`${schema.publications.version} + 1`
      })
      .where(eq(schema.publications.id, publicationId));
  }

  /**
   * The real counterpart to the FakeProviderAdapter path above: it exists so the
   * queue/approval pipeline can be exercised end to end before Google grants the
   * legacy Reviews access this call needs, gated the same way every other real
   * provider call in this file is.
   */
  private async publishReviewReply(
    job: JobEnvelope,
    context: TenantContext,
    database: Database
  ): Promise<JobResult> {
    const reviewId = job.payload.review_id;
    const replyId = job.payload.reply_id;
    if (typeof reviewId !== "string" || typeof replyId !== "string") {
      throw new Error("publish_reply job is missing review_id or reply_id");
    }

    const reviewRows = await database
      .select({ externalId: schema.reviews.externalId })
      .from(schema.reviews)
      .where(and(eq(schema.reviews.id, reviewId), eq(schema.reviews.tenantId, context.tenantId)))
      .limit(1);
    const review = reviewRows[0];
    if (review === undefined) {
      throw new Error(`Review ${reviewId} not found for tenant ${context.tenantId}`);
    }

    const replyRows = await database
      .select({ body: schema.reviewReplies.body })
      .from(schema.reviewReplies)
      .where(
        and(
          eq(schema.reviewReplies.id, replyId),
          eq(schema.reviewReplies.tenantId, context.tenantId)
        )
      )
      .limit(1);
    const reply = replyRows[0];
    if (reply === undefined) {
      throw new Error(`Review reply ${replyId} not found for tenant ${context.tenantId}`);
    }

    const connection = await activeConnection(database, context, "google_business");
    const accessToken = await accessTokenFor(database, connection.id, {
      clientId: this.config.GOOGLE_CLIENT_ID,
      clientSecret: this.config.GOOGLE_CLIENT_SECRET,
      redirectUri: `${this.config.API_BASE_URL}/v1/integrations/google_business/callback`
    });
    await replyToReview({
      accessToken,
      reviewExternalId: review.externalId,
      comment: reply.body
    });

    await database
      .update(schema.reviewReplies)
      .set({ status: "published", publishedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.reviewReplies.id, replyId));
    await database
      .update(schema.reviews)
      .set({ replyStatus: "published", updatedAt: new Date() })
      .where(eq(schema.reviews.id, reviewId));

    return {
      status: "completed",
      cursor: null,
      details: { review_id: reviewId, reply_id: replyId, published: true }
    };
  }

  private provider(value: unknown): ProviderAdapter {
    const name = String(value) as ProviderName;
    const provider = this.providers.get(name);
    if (provider === undefined) {
      throw new Error(`Unsupported provider: ${name}`);
    }
    return provider;
  }
}

function publicationTerminalResult(publicationId: string, status: string): JobResult | null {
  if (status === "published") {
    return {
      status: "completed",
      cursor: null,
      details: { publication_id: publicationId, duplicate: true }
    };
  }
  if (status === "cancelled") {
    return {
      status: "completed",
      cursor: null,
      details: { publication_id: publicationId, cancelled: true }
    };
  }
  return null;
}

function realPublicationEnabled(config: AppConfig, provider: string): boolean {
  return config.FEATURE_REAL_PROVIDERS && provider === "google_business";
}

function publicationFailureCode(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 80) : "provider_error";
}

function hasSignedUrl(value: unknown): value is { readonly signedURL: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).signedURL === "string"
  );
}

function escapeEmailHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
