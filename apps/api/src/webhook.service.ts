import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { parseConfig } from "@growth-manager/config";
import type { DatabaseClient } from "@growth-manager/database";
import { DomainError } from "@growth-manager/domain";
import { verifyResendWebhook } from "@growth-manager/integrations";
import { DATABASE } from "./database.provider.js";

interface ResendInput {
  readonly id: string;
  readonly timestamp: string;
  readonly signature: string;
  readonly payload: string;
}

const resendEventSchema = z.looseObject({
  type: z.string().min(1).max(100),
  data: z.record(z.string(), z.unknown())
});

@Injectable()
export class WebhookService {
  private readonly config = parseConfig(process.env);

  public constructor(@Inject(DATABASE) private readonly client: DatabaseClient) {}

  public async receiveResend(
    input: ResendInput
  ): Promise<{ readonly accepted: boolean; readonly duplicate: boolean }> {
    if (
      !verifyResendWebhook({
        ...input,
        secret: this.config.RESEND_WEBHOOK_SECRET
      })
    ) {
      throw new DomainError("GM-WEBHOOK-SIGNATURE", "Assinatura inválida.", false);
    }

    const event = resendEventSchema.parse(JSON.parse(input.payload) as unknown);
    const hash = createHash("sha256").update(input.payload).digest("hex");
    const objectKey = `webhooks/resend/${new Date().toISOString().slice(0, 10)}/${input.id}-${hash}.json`;
    await this.persistRaw(objectKey, input.payload);

    const result = await this.client.database.execute<{ inserted: boolean }>(sql`
      select app.ingest_resend_event(
        ${input.id}, ${event.type}, ${objectKey}, ${hash}
      ) as inserted
    `);
    const inserted = result[0]?.inserted ?? false;
    return { accepted: true, duplicate: !inserted };
  }

  private async persistRaw(objectKey: string, payload: string): Promise<void> {
    const response = await fetch(`${this.config.SUPABASE_URL}/storage/v1/object/raw/${objectKey}`, {
      method: "POST",
      headers: {
        apikey: this.config.SUPABASE_SECRET_KEY,
        Authorization: `Bearer ${this.config.SUPABASE_SECRET_KEY}`,
        "Content-Type": "application/json",
        "x-upsert": "false"
      },
      body: payload
    });
    if (!response.ok && response.status !== 409) {
      throw new DomainError("GM-STORAGE-WEBHOOK", "Não foi possível preservar o webhook.", true);
    }
  }
}
