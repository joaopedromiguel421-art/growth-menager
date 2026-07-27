import { describe, expect, it } from "vitest";
import type { SeoCapabilityCode } from "@growth-manager/contracts";
import { planSeoAnalysis, type SeoPlanningContext } from "./planner.js";

const all = new Set<SeoCapabilityCode>([
  "technical",
  "content",
  "schema",
  "sitemap",
  "performance",
  "visual",
  "google",
  "local",
  "maps",
  "competitor",
  "backlink",
  "ai_visibility",
  "sxo",
  "drift"
]);

function context(overrides: Partial<SeoPlanningContext> = {}): SeoPlanningContext {
  return {
    mode: "periodic",
    enabledCapabilities: all,
    requestedCapabilities: null,
    acquisitionAvailable: true,
    budgetAvailable: true,
    dueCapabilities: new Set(["technical", "content", "schema", "sitemap"]),
    integrations: new Set(),
    hasLocation: false,
    hasLocalSignals: false,
    geogridEnabled: false,
    activeKeywordCount: 0,
    competitorCount: 0,
    baselineAvailable: false,
    spaDetected: false,
    visualRequested: false,
    previousRegressions: new Set(),
    ...overrides
  };
}

function status(plan: ReturnType<typeof planSeoAnalysis>, code: SeoCapabilityCode): string {
  return plan.items.find((item) => item.capabilityCode === code)?.status ?? "missing";
}

describe("SEO conditional planner", () => {
  it("queues the core and skips capabilities without prerequisites", () => {
    const plan = planSeoAnalysis(context());
    for (const code of ["technical", "content", "schema", "sitemap"] as const) {
      expect(status(plan, code)).toBe("queued");
    }
    expect(status(plan, "maps")).toBe("skipped");
    expect(status(plan, "drift")).toBe("skipped");
  });

  it("does not run Maps for a non-local target", () => {
    const item = planSeoAnalysis(
      context({ integrations: new Set(["dataforseo"]), activeKeywordCount: 3 })
    ).items.find((candidate) => candidate.capabilityCode === "maps");
    expect(item).toMatchObject({ status: "skipped", reason: "not_applicable" });
  });

  it("blocks paid capabilities before a provider call when budget is unavailable", () => {
    const item = planSeoAnalysis(
      context({
        budgetAvailable: false,
        hasLocation: true,
        geogridEnabled: true,
        activeKeywordCount: 2,
        dueCapabilities: new Set(["maps"]),
        integrations: new Set(["dataforseo"])
      })
    ).items.find((candidate) => candidate.capabilityCode === "maps");
    expect(item).toMatchObject({ status: "skipped", reason: "cost_limit" });
  });

  it("runs drift only with a baseline", () => {
    expect(status(planSeoAnalysis(context({ baselineAvailable: true })), "drift")).toBe("queued");
  });
});
