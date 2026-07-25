import type { JobEnvelope } from "@growth-manager/contracts";
import {
  FakeProviderAdapter,
  type ProviderAdapter,
  type ProviderName
} from "@growth-manager/integrations";
import type { TenantContext } from "@growth-manager/domain";

export interface JobResult {
  readonly status: "completed" | "continued";
  readonly cursor: Readonly<Record<string, unknown>> | null;
  readonly details: Readonly<Record<string, unknown>>;
}

const externalWriteJobs = new Set<JobEnvelope["job_type"]>(["publish_reply", "publish_content"]);

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

  public async process(job: JobEnvelope, context: TenantContext): Promise<JobResult> {
    if (job.job_type === "sync") {
      return this.processSync(job, context);
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

  private async processSync(job: JobEnvelope, context: TenantContext): Promise<JobResult> {
    const provider = this.provider(job.payload.provider);
    const result = await provider.read({
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
