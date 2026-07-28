import type { SeoReadResult } from "../seo/ports.js";

type FetchImplementation = typeof fetch;

interface GooglePerformanceOptions {
  readonly apiKey: string;
  readonly fetchImpl?: FetchImplementation;
}

export interface PageSpeedResult {
  readonly source: "pagespeed";
  readonly url: string;
  readonly strategy: "mobile" | "desktop";
  readonly fetchedAt: string | null;
  readonly performanceScore: number | null;
  readonly lcpMs: number | null;
  readonly cls: number | null;
  readonly totalBlockingTimeMs: number | null;
}

export class PageSpeedInsightsClient {
  private readonly fetchImpl: FetchImplementation;

  public constructor(private readonly options: GooglePerformanceOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  public async read(input: {
    readonly url: string;
    readonly strategy: "mobile" | "desktop";
  }): Promise<SeoReadResult<PageSpeedResult>> {
    const endpoint = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
    endpoint.searchParams.set("url", input.url);
    endpoint.searchParams.set("strategy", input.strategy);
    endpoint.searchParams.set("category", "PERFORMANCE");
    endpoint.searchParams.set("key", this.options.apiKey);
    const response = await this.fetchImpl(endpoint, { headers: { Accept: "application/json" } });
    if (!response.ok) {
      throw new Error(`PageSpeed Insights failed with status ${response.status.toString()}`);
    }
    const body = asRecord(await response.json());
    const lighthouse = asRecord(body.lighthouseResult);
    const categories = asRecord(lighthouse.categories);
    const performance = asRecord(categories.performance);
    const audits = asRecord(lighthouse.audits);
    const capturedAt = new Date();
    return {
      data: {
        source: "pagespeed",
        url: typeof body.id === "string" ? body.id : input.url,
        strategy: input.strategy,
        fetchedAt: typeof lighthouse.fetchTime === "string" ? lighthouse.fetchTime : null,
        performanceScore: finiteNumber(performance.score),
        lcpMs: auditValue(audits, "largest-contentful-paint"),
        cls: auditValue(audits, "cumulative-layout-shift"),
        totalBlockingTimeMs: auditValue(audits, "total-blocking-time")
      },
      providerRequestId: response.headers.get("x-request-id"),
      cost: { amount: 0, currency: "USD", quantity: 1, unit: "request" },
      capturedAt
    };
  }
}

export interface ChromeUxResult {
  readonly source: "crux";
  readonly url: string;
  readonly formFactor: "PHONE" | "DESKTOP" | "TABLET" | null;
  readonly lcpMs: number | null;
  readonly cls: number | null;
  readonly inpMs: number | null;
  readonly collectionPeriod: Readonly<Record<string, unknown>> | null;
}

export class ChromeUxReportClient {
  private readonly fetchImpl: FetchImplementation;

  public constructor(private readonly options: GooglePerformanceOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  public async read(input: {
    readonly url: string;
    readonly formFactor: "PHONE" | "DESKTOP" | "TABLET";
  }): Promise<SeoReadResult<ChromeUxResult>> {
    const endpoint = new URL("https://chromeuxreport.googleapis.com/v1/records:queryRecord");
    endpoint.searchParams.set("key", this.options.apiKey);
    const response = await this.fetchImpl(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: input.url,
        formFactor: input.formFactor,
        metrics: [
          "largest_contentful_paint",
          "cumulative_layout_shift",
          "interaction_to_next_paint"
        ]
      })
    });
    if (!response.ok) {
      throw new Error(`Chrome UX Report failed with status ${response.status.toString()}`);
    }
    const body = asRecord(await response.json());
    const record = asRecord(body.record);
    const key = asRecord(record.key);
    const metrics = asRecord(record.metrics);
    const capturedAt = new Date();
    return {
      data: {
        source: "crux",
        url: typeof key.url === "string" ? key.url : input.url,
        formFactor: isFormFactor(key.formFactor) ? key.formFactor : null,
        lcpMs: percentile(metrics, "largest_contentful_paint"),
        cls: percentile(metrics, "cumulative_layout_shift"),
        inpMs: percentile(metrics, "interaction_to_next_paint"),
        collectionPeriod: isRecord(record.collectionPeriod) ? record.collectionPeriod : null
      },
      providerRequestId: response.headers.get("x-request-id"),
      cost: { amount: 0, currency: "USD", quantity: 1, unit: "request" },
      capturedAt
    };
  }
}

function auditValue(audits: Readonly<Record<string, unknown>>, key: string): number | null {
  return finiteNumber(asRecord(audits[key]).numericValue);
}

function percentile(metrics: Readonly<Record<string, unknown>>, key: string): number | null {
  return finiteNumber(asRecord(asRecord(metrics[key]).percentiles).p75);
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): Readonly<Record<string, unknown>> {
  return isRecord(value) ? value : {};
}

function isFormFactor(value: unknown): value is "PHONE" | "DESKTOP" | "TABLET" {
  return value === "PHONE" || value === "DESKTOP" || value === "TABLET";
}
