import { createHmac, timingSafeEqual } from "node:crypto";

export interface EmailMessage {
  readonly from: string;
  readonly to: readonly string[];
  readonly subject: string;
  readonly html: string;
  readonly text?: string;
  readonly replyTo?: string;
  readonly idempotencyKey: string;
}

export interface EmailReceipt {
  readonly providerMessageId: string;
}

export class ResendEmailAdapter {
  public constructor(
    private readonly apiKey: string,
    private readonly endpoint = "https://api.resend.com"
  ) {}

  public async send(message: EmailMessage): Promise<EmailReceipt> {
    const response = await fetch(`${this.endpoint}/emails`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": message.idempotencyKey
      },
      body: JSON.stringify({
        from: message.from,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
        reply_to: message.replyTo
      })
    });
    if (!response.ok) {
      throw new Error(`Resend request failed with status ${response.status.toString()}`);
    }
    const body: unknown = await response.json();
    if (!hasMessageId(body)) {
      throw new Error("Resend returned an invalid receipt");
    }
    return { providerMessageId: body.id };
  }
}

export interface WebhookSignature {
  readonly id: string;
  readonly timestamp: string;
  readonly signature: string;
  readonly payload: string;
  readonly secret: string;
  readonly nowSeconds?: number;
  readonly toleranceSeconds?: number;
}

export function verifyResendWebhook(input: WebhookSignature): boolean {
  const timestamp = Number(input.timestamp);
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const tolerance = input.toleranceSeconds ?? 300;
  if (!Number.isSafeInteger(timestamp) || Math.abs(now - timestamp) > tolerance) {
    return false;
  }

  const secret = input.secret.startsWith("whsec_")
    ? input.secret.slice("whsec_".length)
    : input.secret;
  const key = Buffer.from(secret, "base64");
  const expected = createHmac("sha256", key)
    .update(`${input.id}.${input.timestamp}.${input.payload}`)
    .digest();

  return input.signature.split(" ").some((candidate) => {
    const value = candidate.startsWith("v1,") ? candidate.slice(3) : "";
    const actual = Buffer.from(value, "base64");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  });
}

function hasMessageId(value: unknown): value is { readonly id: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).id === "string"
  );
}
