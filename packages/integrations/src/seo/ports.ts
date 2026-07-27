export interface SeoProviderCost {
  readonly amount: number;
  readonly currency: string;
  readonly quantity: number;
  readonly unit: string;
}

export interface SeoReadResult<T> {
  readonly data: T;
  readonly providerRequestId: string | null;
  readonly cost: SeoProviderCost;
  readonly capturedAt: Date;
}

export interface SeoRenderer {
  render(input: {
    readonly url: string;
    readonly requestId: string;
    readonly timeoutMs: number;
  }): Promise<SeoReadResult<{ readonly html: string; readonly screenshotUrl: string | null }>>;
}

export interface SeoMetricProvider<TRequest, TResult> {
  estimate(input: TRequest): Promise<SeoProviderCost>;
  read(input: TRequest): Promise<SeoReadResult<TResult>>;
}
