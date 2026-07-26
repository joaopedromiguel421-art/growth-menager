import { DomainError } from "@growth-manager/domain";

/**
 * Every write route demands a caller-supplied key so a retried request cannot
 * duplicate the effect. The bounds match the idempotency_key column.
 */
export function requireIdempotencyKey(value: string | undefined): string {
  if (value === undefined || value.length < 8 || value.length > 160) {
    throw new DomainError("GM-IDEMPOTENCY-REQUIRED", "Envie um Idempotency-Key válido.", false);
  }
  return value;
}
