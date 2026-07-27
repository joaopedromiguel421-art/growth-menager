export class DomainError extends Error {
  public constructor(
    public readonly code: `GM-${string}`,
    message: string,
    public readonly retryable: boolean,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "DomainError";
  }
}
