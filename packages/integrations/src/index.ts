export type ProviderName =
  | "google_business"
  | "search_console"
  | "ga4"
  | "instagram"
  | "dataforseo"
  | "deepseek"
  | "pagespeed"
  | "crux"
  | "firecrawl"
  | "moz"
  | "ahrefs"
  | "bing"
  | "common_crawl"
  | "profound"
  | "seranking"
  | "openstreetmap";

export interface ProviderCredential {
  readonly secretRef: string;
  readonly scopes: readonly string[];
  readonly expiresAt: Date | null;
}

export interface ProviderRequest {
  readonly tenantId: string;
  readonly requestId: string;
  readonly idempotencyKey: string;
  readonly operation: string;
  readonly cursor: Readonly<Record<string, unknown>> | null;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface ProviderResult {
  readonly data: readonly Readonly<Record<string, unknown>>[];
  readonly nextCursor: Readonly<Record<string, unknown>> | null;
  readonly providerRequestId: string | null;
  readonly cost: {
    readonly amount: number;
    readonly currency: string;
    readonly quantity: number;
    readonly unit: string;
  };
}

export interface ProviderAdapter {
  readonly name: ProviderName;
  authorize(input: ProviderRequest): Promise<Readonly<Record<string, unknown>>>;
  health(credential: ProviderCredential): Promise<"healthy" | "degraded" | "invalid">;
  read(input: ProviderRequest): Promise<ProviderResult>;
  write(input: ProviderRequest): Promise<ProviderResult>;
  reconcile(input: ProviderRequest): Promise<ProviderResult>;
}

export class FakeProviderAdapter implements ProviderAdapter {
  public constructor(public readonly name: ProviderName) {}

  public async authorize(): Promise<Readonly<Record<string, unknown>>> {
    return Promise.resolve({ authorization_url: `https://example.invalid/oauth/${this.name}` });
  }

  public async health(): Promise<"healthy"> {
    return Promise.resolve("healthy");
  }

  public async read(input: ProviderRequest): Promise<ProviderResult> {
    return Promise.resolve(this.result(input));
  }

  public async write(input: ProviderRequest): Promise<ProviderResult> {
    return Promise.resolve(this.result(input));
  }

  public async reconcile(input: ProviderRequest): Promise<ProviderResult> {
    return Promise.resolve(this.result(input));
  }

  private result(input: ProviderRequest): ProviderResult {
    return {
      data: [{ fixture: true, operation: input.operation }],
      nextCursor: null,
      providerRequestId: `fake-${input.idempotencyKey}`,
      cost: { amount: 0, currency: "USD", quantity: 1, unit: "request" }
    };
  }
}

export * from "./resend.js";
export * from "./google/oauth.js";
export * from "./google/api.js";
export * from "./google/performance.js";
export * from "./seo/ports.js";
export * from "./seo/safe-fetch.js";
export * from "./seo/deepseek.js";
export * from "./seo/dataforseo.js";
export * from "./seo/firecrawl.js";
export * from "./seo/artifact-store.js";
