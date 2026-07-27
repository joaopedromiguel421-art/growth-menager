import { and, eq } from "drizzle-orm";
import type { JobEnvelope } from "@growth-manager/contracts";
import { parseConfig, type AppConfig } from "@growth-manager/config";
import { schema, type Database } from "@growth-manager/database";
import {
  FakeProviderAdapter,
  replyToReview,
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

export interface JobResult {
  readonly status: "completed" | "continued";
  readonly cursor: Readonly<Record<string, unknown>> | null;
  readonly details: Readonly<Record<string, unknown>>;
}

const externalWriteJobs = new Set<JobEnvelope["job_type"]>(["publish_reply", "publish_content"]);
const realSyncProviders = new Set<string>(["google_business", "search_console"]);

export class JobProcessor {
  private readonly seo: SeoAnalysisProcessor;
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
      const engine = await generateRecommendations({
        database,
        context,
        provider: provider as SyncableProvider
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
