import { describe, expect, it } from "vitest";
import {
  areSeoSnapshotsComparable,
  baselineStatus,
  seoConfidence,
  systemFindingStatus,
  validateFindingStatusUpdate,
  validateSeoFindingDraft,
  type SeoFindingDraft
} from "./seo.js";

const evidenceId = "01954d2e-3b80-7000-8000-000000000001";

function draft(overrides: Partial<SeoFindingDraft> = {}): SeoFindingDraft {
  return {
    target_id: "01954d2e-3b80-7000-8000-000000000002",
    code: "SEO-TECH-CANONICAL-MISSING",
    category: "technical",
    severity: "high",
    title: "Canonical ausente",
    description: "A página não declarou canonical.",
    confidence: seoConfidence({ coverage: 1, freshness: 1, agreement: 1 }),
    evidence_ids: [evidenceId],
    origin: {
      capability_code: "technical",
      source: "crawler",
      provider: null,
      rule_version: "seo-rules-v1",
      prompt_version: null,
      captured_at: "2026-07-27T12:00:00.000Z"
    },
    recommendation: "Declare uma canonical válida após revisar a URL preferida.",
    impact: { band: "high", affected_scope: "/", metric_keys: [] },
    ...overrides
  };
}

describe("SEO finding validation", () => {
  it("rejects evidence from outside the validated set", () => {
    expect(() => validateSeoFindingDraft(draft(), new Set())).toThrow("evidência indisponível");
  });

  it("downgrades low-confidence findings to insufficient evidence", () => {
    const result = validateSeoFindingDraft(
      draft({
        confidence: seoConfidence({ coverage: 0.2, freshness: 0.2, agreement: 0.2 }),
        impact: { band: "unknown", affected_scope: "/", metric_keys: [] }
      }),
      new Set([evidenceId])
    );
    expect(result.status).toBe("insufficient_evidence");
  });

  it("does not allow the client to resolve a finding directly", () => {
    expect(() => {
      validateFindingStatusUpdate("open", {
        version: 1,
        status: "accepted",
        reason: null,
        dismiss_until: null
      });
    }).not.toThrow();
  });
});

describe("SEO baseline lifecycle", () => {
  it("requires two clean comparable runs except for critical availability", () => {
    expect(
      systemFindingStatus({
        current: "open",
        matched: false,
        consecutiveCleanRuns: 1,
        criticalAvailabilityOrIndexing: false
      })
    ).toBe("open");
    expect(
      systemFindingStatus({
        current: "open",
        matched: false,
        consecutiveCleanRuns: 1,
        criticalAvailabilityOrIndexing: true
      })
    ).toBe("resolved");
  });

  it("marks incomplete baselines provisional", () => {
    expect(baselineStatus(0.99)).toBe("provisional");
    expect(baselineStatus(1)).toBe("active");
  });

  it("does not compare a different ruleset", () => {
    const identity = {
      source: "crawler",
      device: null,
      location: null,
      locale: "pt-BR",
      keyword: null,
      ruleVersion: "v1"
    };
    expect(areSeoSnapshotsComparable(identity, { ...identity, ruleVersion: "v2" })).toBe(false);
  });
});
