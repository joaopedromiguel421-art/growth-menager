const forbiddenKeys = /token|secret|password|cookie|authorization|email|body|prompt/i;

export interface LogContext {
  readonly requestId: string;
  readonly traceId: string;
  readonly tenantId?: string;
  readonly operation: string;
  readonly [key: string]: unknown;
}

function redact(context: LogContext): Readonly<Record<string, unknown>> {
  return Object.fromEntries(
    Object.entries(context).map(([key, value]) => [
      key,
      forbiddenKeys.test(key) ? "[REDACTED]" : value
    ])
  );
}

export const logger = {
  info(context: LogContext, message: string): void {
    console.info(JSON.stringify({ level: "info", message, ...redact(context) }));
  },
  warn(context: LogContext, message: string): void {
    console.warn(JSON.stringify({ level: "warn", message, ...redact(context) }));
  },
  error(context: LogContext, message: string): void {
    console.error(JSON.stringify({ level: "error", message, ...redact(context) }));
  }
};
