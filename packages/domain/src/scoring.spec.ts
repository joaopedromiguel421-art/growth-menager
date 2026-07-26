import { describe, expect, it } from "vitest";
import {
  confidenceBand,
  freshnessScore,
  priorityScore,
  recommendationConfidence
} from "./scoring.js";

describe("priorityScore", () => {
  it("reproduces the reference case", () => {
    // 0.35*0.75 + 0.25*0.87 + 0.20*0.50 + 0.15*1 + 0.05*0.50 = 0.7600
    expect(
      priorityScore({ impact: 0.75, confidence: 0.87, urgency: 0.5, alignment: 1, effort: 0.5 })
    ).toBe(76);
  });

  it("spans the full range", () => {
    expect(priorityScore({ impact: 0, confidence: 0, urgency: 0, alignment: 0, effort: 1 })).toBe(
      0
    );
    expect(priorityScore({ impact: 1, confidence: 1, urgency: 1, alignment: 1, effort: 0 })).toBe(
      100
    );
  });

  it("rewards the cheaper of two otherwise identical actions", () => {
    const base = { impact: 0.6, confidence: 0.6, urgency: 0.6, alignment: 0.6 };
    expect(priorityScore({ ...base, effort: 0.1 })).toBeGreaterThan(
      priorityScore({ ...base, effort: 0.9 })
    );
  });

  it("rejects inputs outside the unit interval", () => {
    expect(() =>
      priorityScore({ impact: 1.2, confidence: 0.5, urgency: 0.5, alignment: 0.5, effort: 0.5 })
    ).toThrow(RangeError);
    expect(() =>
      priorityScore({
        impact: Number.NaN,
        confidence: 0.5,
        urgency: 0.5,
        alignment: 0.5,
        effort: 0.5
      })
    ).toThrow(RangeError);
  });
});

describe("recommendationConfidence", () => {
  it("weights coverage above freshness and agreement", () => {
    expect(recommendationConfidence({ coverage: 1, freshness: 0, agreement: 0 })).toBe(0.4);
    expect(recommendationConfidence({ coverage: 0, freshness: 1, agreement: 0 })).toBe(0.3);
    expect(recommendationConfidence({ coverage: 0, freshness: 0, agreement: 1 })).toBe(0.3);
  });

  it("rounds to two decimals so it fits the stored precision", () => {
    expect(recommendationConfidence({ coverage: 0.333, freshness: 0.333, agreement: 0.333 })).toBe(
      0.33
    );
  });
});

describe("confidenceBand", () => {
  it("places each boundary in the higher band", () => {
    expect(confidenceBand(0.8)).toBe("alta");
    expect(confidenceBand(0.79)).toBe("media");
    expect(confidenceBand(0.6)).toBe("media");
    expect(confidenceBand(0.59)).toBe("baixa");
    expect(confidenceBand(0.4)).toBe("baixa");
    expect(confidenceBand(0.39)).toBe("insuficiente");
  });
});

describe("freshnessScore", () => {
  const now = new Date("2026-07-26T12:00:00.000Z");

  it("scores an observation from today as fully fresh", () => {
    expect(freshnessScore(now, now)).toBe(1);
  });

  it("decays to zero at the horizon and stays there", () => {
    expect(freshnessScore(new Date("2026-07-19T12:00:00.000Z"), now, 14)).toBe(0.5);
    expect(freshnessScore(new Date("2026-07-12T12:00:00.000Z"), now, 14)).toBe(0);
    expect(freshnessScore(new Date("2026-01-01T00:00:00.000Z"), now, 14)).toBe(0);
  });
});
