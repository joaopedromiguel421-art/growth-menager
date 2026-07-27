import { z } from "zod";
import type { SeoReadResult, SeoRenderer } from "./ports.js";

const firecrawlResponseSchema = z
  .object({
    success: z.literal(true),
    data: z
      .object({
        html: z.string(),
        screenshot: z.url().nullable().optional(),
        metadata: z.record(z.string(), z.unknown()).optional()
      })
      .loose()
  })
  .loose();

export class FirecrawlRenderer implements SeoRenderer {
  public constructor(
    private readonly options: {
      readonly apiKey: string;
      readonly baseUrl: string;
      readonly fetchImpl?: typeof fetch;
    }
  ) {}

  public async render(input: {
    readonly url: string;
    readonly requestId: string;
    readonly timeoutMs: number;
  }): Promise<SeoReadResult<{ readonly html: string; readonly screenshotUrl: string | null }>> {
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const response = await fetchImpl(`${this.options.baseUrl.replace(/\/$/u, "")}/v1/scrape`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.options.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Request-ID": input.requestId
      },
      body: JSON.stringify({
        url: input.url,
        formats: ["html", "screenshot"],
        onlyMainContent: false
      }),
      signal: AbortSignal.timeout(input.timeoutMs)
    });
    if (!response.ok) throw new Error(`Renderer failed with status ${String(response.status)}`);
    const parsed = firecrawlResponseSchema.parse(await response.json());
    return {
      data: { html: parsed.data.html, screenshotUrl: parsed.data.screenshot ?? null },
      providerRequestId: response.headers.get("x-request-id"),
      cost: { amount: 0, currency: "USD", quantity: 1, unit: "render" },
      capturedAt: new Date()
    };
  }
}
