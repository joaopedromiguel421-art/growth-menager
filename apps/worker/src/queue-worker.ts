import { jobEnvelopeSchema, type JobEnvelope } from "@growth-manager/contracts";
import { sql, type Database, type DatabaseClient } from "@growth-manager/database";
import type { TenantContext } from "@growth-manager/domain";
import { logger } from "@growth-manager/observability";
import { JobProcessor } from "./job-processor.js";

interface QueueRecord extends Record<string, unknown> {
  readonly msg_id: number;
  readonly read_ct: number;
  readonly message: unknown;
}

export interface PumpResult {
  readonly relayed: number;
  readonly received: number;
  readonly completed: number;
  readonly failed: number;
  readonly deadLettered: number;
}

const queueNames = ["publication", "delivery", "render", "general"] as const;

export class QueueWorker {
  private readonly processor = new JobProcessor();

  public constructor(private readonly client: DatabaseClient) {}

  public async pump(batchSize = 10): Promise<PumpResult> {
    const relayed = await this.relayOutbox(batchSize);
    const accumulator = { relayed, received: 0, completed: 0, failed: 0, deadLettered: 0 };

    for (const queue of queueNames) {
      const records = await this.read(queue, batchSize);
      accumulator.received += records.length;
      for (const record of records) {
        const outcome = await this.handle(queue, record);
        accumulator[outcome] += 1;
      }
    }

    return accumulator;
  }

  private async relayOutbox(limit: number): Promise<number> {
    const result = await this.client.database.execute<{ relayed: number }>(
      sql`select app.relay_outbox(${limit}) as relayed`
    );
    return result[0]?.relayed ?? 0;
  }

  private async read(queue: string, limit: number): Promise<readonly QueueRecord[]> {
    return this.client.database.execute<QueueRecord>(
      sql`select msg_id, read_ct, message from app.queue_read(${queue}, 120, ${limit})`
    );
  }

  private async handle(
    queue: string,
    record: QueueRecord
  ): Promise<"completed" | "failed" | "deadLettered"> {
    const parsed = jobEnvelopeSchema.safeParse(record.message);
    if (!parsed.success) {
      await this.deadLetter(queue, record, "GM-JOB-SCHEMA", parsed.error.issues);
      return "deadLettered";
    }

    const job = parsed.data;
    const context = this.systemContext(job);
    try {
      const result = await this.client.withTenant(context, async (database) => {
        // gen_random_uuid() has to come from pg_catalog: gm_api holds no USAGE on the
        // extensions schema, so qualifying it as extensions.gen_random_uuid() fails
        // with permission denied and no job ever gets claimed.
        const claimed = await database.execute<{ id: string }>(sql`
          insert into app.inbox_messages (
            id, tenant_id, consumer, message_id, received_at
          ) values (
            gen_random_uuid(), ${job.tenant_id}, ${queue}, ${job.id}, now()
          )
          on conflict (consumer, message_id) do nothing
          returning id
        `);
        if (claimed.length === 0) return { duplicate: true } as const;

        await this.markSyncJob(database, job, "running", null);
        const processed = await this.processor.process(job, context, database);
        await this.markSyncJob(database, job, "completed", processed.details);
        await database.execute(sql`
          update app.inbox_messages
          set processed_at = now(), result = ${JSON.stringify(processed)}::jsonb
          where consumer = ${queue} and message_id = ${job.id}
        `);
        return { duplicate: false, processed } as const;
      });

      if (!result.duplicate && result.processed.status === "continued") {
        const continued = {
          ...job,
          id: crypto.randomUUID(),
          cursor: result.processed.cursor,
          attempt: 0,
          enqueued_at: new Date().toISOString()
        } satisfies JobEnvelope;
        await this.client.database.execute(
          sql`select app.queue_send(${queue}, ${JSON.stringify(continued)}::jsonb)`
        );
      }
      await this.delete(queue, record.msg_id);
      return "completed";
    } catch (error) {
      logger.error(
        {
          requestId: context.requestId,
          traceId: context.traceId,
          tenantId: context.tenantId,
          operation: job.job_type,
          queue,
          attempt: record.read_ct
        },
        "Job processing failed"
      );
      if (record.read_ct >= 5) {
        await this.deadLetter(queue, record, "GM-JOB-DLQ", this.safeError(error));
        return "deadLettered";
      }
      return "failed";
    }
  }

  /**
   * A manual sync is tracked by an app.sync_jobs row the API created, so the queue
   * has to report progress back onto it for the connections screen to be truthful.
   */
  private async markSyncJob(
    database: Database,
    job: JobEnvelope,
    status: "running" | "completed",
    details: Readonly<Record<string, unknown>> | null
  ): Promise<void> {
    const syncJobId = job.payload.sync_job_id;
    if (typeof syncJobId !== "string") return;

    const read = Number(details?.rows ?? 0);
    const written = Number(details?.written ?? 0);
    await database.execute(sql`
      update app.sync_jobs
      set status = ${status},
          started_at = coalesce(started_at, now()),
          finished_at = case when ${status} = 'completed' then now() else finished_at end,
          records_read = ${Number.isFinite(read) ? read : 0},
          records_written = ${Number.isFinite(written) ? written : 0},
          updated_at = now(),
          version = version + 1
      where id = ${syncJobId}::uuid and tenant_id = ${job.tenant_id}::uuid
    `);
  }

  private async deadLetter(
    queue: string,
    record: QueueRecord,
    code: string,
    error: unknown
  ): Promise<void> {
    const untrusted = record.message as Partial<JobEnvelope>;
    const tenantId = typeof untrusted.tenant_id === "string" ? untrusted.tenant_id : null;
    await this.client.database.execute(sql`
      select app.deadletter_job(
        ${queue}, ${record.msg_id}, ${tenantId}::uuid, ${untrusted.job_type ?? "invalid"},
        ${JSON.stringify(record.message)}::jsonb, ${JSON.stringify({ code, error })}::jsonb,
        ${record.read_ct}
      )
    `);
  }

  private async delete(queue: string, messageId: number): Promise<void> {
    await this.client.database.execute(sql`select app.queue_delete(${queue}, ${messageId})`);
  }

  private systemContext(job: JobEnvelope): TenantContext {
    return {
      tenantId: job.tenant_id,
      userId: "00000000-0000-0000-0000-000000000000",
      authUserId: "00000000-0000-0000-0000-000000000000",
      organizationId: "00000000-0000-0000-0000-000000000000",
      requestId: job.id,
      traceId: job.trace_id,
      permissions: new Set(),
      systemActor: true
    };
  }

  private safeError(error: unknown): Readonly<Record<string, string>> {
    return error instanceof Error
      ? { name: error.name, message: error.message }
      : { name: "UnknownError", message: "Unknown job failure" };
  }
}
