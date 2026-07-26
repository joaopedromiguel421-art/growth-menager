import type { JobEnvelope } from "@growth-manager/contracts";
import { parseConfig, type AppConfig } from "@growth-manager/config";
import type { Database } from "@growth-manager/database";
import {
  FakeProviderAdapter,
  type ProviderAdapter,
  type ProviderName
} from "@growth-manager/integrations";
import type { TenantContext } from "@growth-manager/domain";
import { syncGoogleProvider, type SyncableProvider } from "./google-sync.js";
import { generateRecommendations } from "./recommendation-engine.js";

export interface JobResult {
  readonly status: "completed" | "continued";
  readonly cursor: Readonly<Record<string, unknown>> | null;
  readonly details: Readonly<Record<string, unknown>>;
}

const externalWriteJobs = new Set<JobEnvelope["job_type"]>(["publish_reply", "publish_content"]);
const realSyncProviders = new Set<string>(["google_business", "search_console"]);

export class JobProcessor {
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

  public constructor(private readonly config: AppConfig = parseConfig(process.env)) {}

  public async process(
    job: JobEnvelope,
    context: TenantContext,
    database: Database
  ): Promise<JobResult> {
    if (job.job_type === "sync") {
      return this.processSync(job, context, database);
    }
    if (externalWriteJobs.has(job.job_type)) {
      return this.processExternalWrite(job, context);
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
          recommendations_updated: engine.updated
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

  private async processExternalWrite(job: JobEnvelope, context: TenantContext): Promise<JobResult> {
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

  private provider(value: unknown): ProviderAdapter {
    const name = String(value) as ProviderName;
    const provider = this.providers.get(name);
    if (provider === undefined) {
      throw new Error(`Unsupported provider: ${name}`);
    }
    return provider;
  }
}
