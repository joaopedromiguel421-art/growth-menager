import { describe, expect, it } from "vitest";
import { evaluateBudget, reconciledReservation } from "./costs.js";

describe("paid provider budget", () => {
  it("alerts at 50% and 80% and blocks above the hard limit", () => {
    expect(
      evaluateBudget({
        hardLimit: 100,
        spent: 49,
        reserved: 0,
        estimatedCost: 1,
        essentialOverride: false
      }).alertLevel
    ).toBe("fifty");
    expect(
      evaluateBudget({
        hardLimit: 100,
        spent: 79,
        reserved: 0,
        estimatedCost: 1,
        essentialOverride: false
      }).alertLevel
    ).toBe("eighty");
    expect(
      evaluateBudget({
        hardLimit: 100,
        spent: 100,
        reserved: 0,
        estimatedCost: 1,
        essentialOverride: false
      }).allowed
    ).toBe(false);
  });

  it("limits the essential contingency to five percent", () => {
    expect(
      evaluateBudget({
        hardLimit: 100,
        spent: 100,
        reserved: 0,
        estimatedCost: 5,
        essentialOverride: true
      }).allowed
    ).toBe(true);
    expect(
      evaluateBudget({
        hardLimit: 100,
        spent: 100,
        reserved: 0,
        estimatedCost: 6,
        essentialOverride: true
      }).allowed
    ).toBe(false);
  });

  it("releases unused reservations", () => {
    expect(reconciledReservation({ estimatedCost: 5, actualCost: 3 })).toEqual({
      actualCost: 3,
      released: 2,
      overage: 0
    });
  });
});
