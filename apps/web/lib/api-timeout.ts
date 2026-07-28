export type ApiMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

const READ_TIMEOUT_MS = 10_000;
const MUTATION_TIMEOUT_MS = 8_000;

/**
 * Matches the product-wide visual timeout for reads and the synchronous API
 * boundary for mutations. The read budget also absorbs a Vercel cold start.
 */
export function resolveApiTimeout(method: ApiMethod, override?: number): number {
  return override ?? (method === "GET" ? READ_TIMEOUT_MS : MUTATION_TIMEOUT_MS);
}
