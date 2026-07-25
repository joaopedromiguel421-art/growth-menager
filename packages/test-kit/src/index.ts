import type { Dashboard } from "@growth-manager/contracts";

export const TENANT_A_ID = "01954d2e-3b80-7000-8000-000000000001";
export const TENANT_B_ID = "01954d2e-3b80-7000-8000-000000000002";
export const USER_ID = "01954d2e-3b80-7000-8000-000000000003";

export function dashboardFixture(overrides: Partial<Dashboard> = {}): Dashboard {
  return {
    generated_at: "2026-07-25T12:00:00.000Z",
    data_quality: "partial",
    recommendations: [],
    tasks: [],
    approvals: [],
    sources: [],
    alerts_open: 0,
    monthly_cost: { amount: 0, currency: "USD", budget_percent: 0 },
    ...overrides
  };
}
