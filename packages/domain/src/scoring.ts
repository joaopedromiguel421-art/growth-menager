/**
 * Prioritisation and confidence formulas.
 *
 * These live in the domain package rather than in the worker because the score
 * shown in the UI, the score written by the recommendation engine and the score
 * asserted by tests must come from one implementation. Both are pure so the
 * numbers can be reproduced from a recommendation's stored inputs.
 */

export const PRIORITY_FORMULA_VERSION = "priority-v1";

export interface PriorityInput {
  /** Expected business impact, 0..1. */
  readonly impact: number;
  /** How much the evidence can be trusted, 0..1. */
  readonly confidence: number;
  /** How much waiting costs, 0..1. */
  readonly urgency: number;
  /** Fit with the client's declared goals, 0..1. */
  readonly alignment: number;
  /** Cost to execute, 0..1 — cheaper work scores higher. */
  readonly effort: number;
}

export interface ConfidenceInput {
  /** Share of the expected sources that actually reported, 0..1. */
  readonly coverage: number;
  /** How recent the underlying observations are, 0..1. */
  readonly freshness: number;
  /** How consistently the sources point the same way, 0..1. */
  readonly agreement: number;
}

function unitInterval(value: number, field: string): number {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${field} must be a finite number.`);
  }
  if (value < 0 || value > 1) {
    throw new RangeError(`${field} must be between 0 and 1, received ${String(value)}.`);
  }
  return value;
}

/**
 * Weighted blend of the five drivers, returned as an integer 0..100 so it can be
 * stored in recommendations.priority_score and compared across tenants. Effort is
 * inverted: the same impact for less work deserves to rank higher.
 */
export function priorityScore(input: PriorityInput): number {
  const impact = unitInterval(input.impact, "impact");
  const confidence = unitInterval(input.confidence, "confidence");
  const urgency = unitInterval(input.urgency, "urgency");
  const alignment = unitInterval(input.alignment, "alignment");
  const effort = unitInterval(input.effort, "effort");

  const weighted =
    0.35 * impact + 0.25 * confidence + 0.2 * urgency + 0.15 * alignment + 0.05 * (1 - effort);
  return Math.round(100 * weighted);
}

/**
 * Confidence in the evidence behind a recommendation, rounded to two decimals to
 * match the numeric(3,2) column and to avoid implying precision the inputs lack.
 */
export function recommendationConfidence(input: ConfidenceInput): number {
  const coverage = unitInterval(input.coverage, "coverage");
  const freshness = unitInterval(input.freshness, "freshness");
  const agreement = unitInterval(input.agreement, "agreement");

  return Math.round((0.4 * coverage + 0.3 * freshness + 0.3 * agreement) * 100) / 100;
}

export type ConfidenceBand = "alta" | "media" | "baixa" | "insuficiente";

/**
 * The band, not the raw number, decides whether a recommendation may be shown as
 * actionable. Anything below 0.40 is surfaced as "dados insuficientes".
 */
export function confidenceBand(confidence: number): ConfidenceBand {
  const value = unitInterval(confidence, "confidence");
  if (value >= 0.8) return "alta";
  if (value >= 0.6) return "media";
  if (value >= 0.4) return "baixa";
  return "insuficiente";
}

/**
 * Freshness decays linearly to zero over `horizonDays`, so a stale window lowers
 * confidence instead of silently presenting old data as current.
 */
export function freshnessScore(observedAt: Date, now: Date, horizonDays = 14): number {
  if (horizonDays <= 0) throw new RangeError("horizonDays must be positive.");
  const ageMs = now.getTime() - observedAt.getTime();
  if (Number.isNaN(ageMs)) throw new RangeError("observedAt and now must be valid dates.");
  if (ageMs <= 0) return 1;
  const ageDays = ageMs / (24 * 60 * 60 * 1000);
  return Math.max(0, Math.min(1, 1 - ageDays / horizonDays));
}
