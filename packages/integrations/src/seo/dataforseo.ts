import { z } from "zod";
import type { SeoReadResult } from "./ports.js";

export type DataForSeoOperation =
  | "serp_google_organic"
  | "serp_google_maps"
  | "backlinks_summary"
  | "on_page_instant";

const endpointByOperation: Readonly<Record<DataForSeoOperation, string>> = {
  serp_google_organic: "/v3/serp/google/organic/live/advanced",
  serp_google_maps: "/v3/serp/google/maps/live/advanced",
  backlinks_summary: "/v3/backlinks/summary/live",
  on_page_instant: "/v3/on_page/instant_pages"
};

const responseSchema = z
  .object({
    status_code: z.number().int(),
    status_message: z.string(),
    cost: z.number().nonnegative().optional(),
    tasks: z.array(z.record(z.string(), z.unknown())).default([])
  })
  .loose();

export interface DataForSeoRequest {
  readonly operation: DataForSeoOperation;
  readonly tasks: readonly Readonly<Record<string, unknown>>[];
  readonly requestId: string;
}

export class DataForSeoAdapter {
  public constructor(
    private readonly options: {
      readonly login: string;
      readonly password: string;
      readonly baseUrl?: string;
      readonly fetchImpl?: typeof fetch;
    }
  ) {}

  public async read(
    input: DataForSeoRequest
  ): Promise<SeoReadResult<readonly Readonly<Record<string, unknown>>[]>> {
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const baseUrl = this.options.baseUrl ?? "https://api.dataforseo.com";
    const response = await fetchImpl(`${baseUrl}${endpointByOperation[input.operation]}`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.options.login}:${this.options.password}`).toString("base64")}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Request-ID": input.requestId
      },
      body: JSON.stringify(input.tasks),
      signal: AbortSignal.timeout(45_000)
    });
    if (!response.ok)
      throw new Error(`DataForSEO read failed with status ${String(response.status)}`);
    const parsed = responseSchema.parse(await response.json());
    if (parsed.status_code >= 40000)
      throw new Error(`DataForSEO read failed with provider code ${String(parsed.status_code)}`);
    return {
      data: parsed.tasks,
      providerRequestId: response.headers.get("x-request-id"),
      cost: {
        amount: parsed.cost ?? 0,
        currency: "USD",
        quantity: input.tasks.length,
        unit: "task"
      },
      capturedAt: new Date()
    };
  }

  public write(): never {
    throw new Error("DataForSEO adapter is read-only.");
  }
}
