export interface BudgetEvaluation {
  readonly allowed: boolean;
  readonly projected: number;
  readonly usageRatio: number;
  readonly alertLevel: "none" | "fifty" | "eighty" | "blocked";
}

export function evaluateBudget(input: {
  readonly hardLimit: number;
  readonly spent: number;
  readonly reserved: number;
  readonly estimatedCost: number;
  readonly essentialOverride: boolean;
  readonly contingencyRatio?: number;
}): BudgetEvaluation {
  assertNonNegativeCosts({
    hardLimit: input.hardLimit,
    spent: input.spent,
    reserved: input.reserved,
    estimatedCost: input.estimatedCost
  });
  if (input.hardLimit === 0) {
    return {
      allowed: false,
      projected: input.spent + input.reserved + input.estimatedCost,
      usageRatio: 1,
      alertLevel: "blocked"
    };
  }
  const contingencyRatio = input.contingencyRatio ?? 0.05;
  if (contingencyRatio < 0 || contingencyRatio > 0.05) {
    throw new RangeError("contingencyRatio must be between 0 and 0.05");
  }
  const projected = input.spent + input.reserved + input.estimatedCost;
  const permittedLimit = input.essentialOverride
    ? input.hardLimit * (1 + contingencyRatio)
    : input.hardLimit;
  const usageRatio = projected / input.hardLimit;
  const allowed = projected <= permittedLimit;
  const alertLevel = budgetAlertLevel(allowed, usageRatio);
  return { allowed, projected, usageRatio, alertLevel };
}

function assertNonNegativeCosts(values: Readonly<Record<string, number>>): void {
  for (const [name, value] of Object.entries(values)) {
    if (!Number.isFinite(value) || value < 0) throw new RangeError(`${name} must be non-negative`);
  }
}

function budgetAlertLevel(allowed: boolean, usageRatio: number): BudgetEvaluation["alertLevel"] {
  if (!allowed) return "blocked";
  if (usageRatio >= 0.8) return "eighty";
  if (usageRatio >= 0.5) return "fifty";
  return "none";
}

export function reconciledReservation(input: {
  readonly estimatedCost: number;
  readonly actualCost: number;
}): { readonly actualCost: number; readonly released: number; readonly overage: number } {
  if (input.estimatedCost < 0 || input.actualCost < 0) {
    throw new RangeError("Costs must be non-negative");
  }
  return {
    actualCost: input.actualCost,
    released: Math.max(0, input.estimatedCost - input.actualCost),
    overage: Math.max(0, input.actualCost - input.estimatedCost)
  };
}
