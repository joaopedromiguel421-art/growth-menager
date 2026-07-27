import {
  seoCoreCapabilityCodes,
  type SeoAnalysisMode,
  type SeoCapabilityCode,
  type SeoSkipReason
} from "@growth-manager/contracts";
import { SEO_PLANNER_VERSION } from "@growth-manager/domain";
import { capabilityDefinition } from "../capabilities/registry.js";

export interface SeoPlanningContext {
  readonly mode: SeoAnalysisMode;
  readonly enabledCapabilities: ReadonlySet<SeoCapabilityCode>;
  readonly requestedCapabilities: ReadonlySet<SeoCapabilityCode> | null;
  readonly acquisitionAvailable: boolean;
  readonly budgetAvailable: boolean;
  readonly dueCapabilities: ReadonlySet<SeoCapabilityCode>;
  readonly integrations: ReadonlySet<string>;
  readonly hasLocation: boolean;
  readonly hasLocalSignals: boolean;
  readonly geogridEnabled: boolean;
  readonly activeKeywordCount: number;
  readonly competitorCount: number;
  readonly baselineAvailable: boolean;
  readonly spaDetected: boolean;
  readonly visualRequested: boolean;
  readonly previousRegressions: ReadonlySet<SeoCapabilityCode>;
}

export type SeoCapabilityPlanItem =
  | {
      readonly capabilityCode: SeoCapabilityCode;
      readonly status: "queued";
      readonly ruleVersion: string;
      readonly maxAttempts: 2 | 3;
    }
  | {
      readonly capabilityCode: SeoCapabilityCode;
      readonly status: "skipped";
      readonly reason: SeoSkipReason;
      readonly ruleVersion: string;
      readonly maxAttempts: 2 | 3;
    };

export interface SeoExecutionPlan {
  readonly plannerVersion: string;
  readonly items: readonly SeoCapabilityPlanItem[];
}

const allCapabilities = [
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
] as const satisfies readonly SeoCapabilityCode[];

export function planSeoAnalysis(context: SeoPlanningContext): SeoExecutionPlan {
  const requested = new Set(context.requestedCapabilities ?? context.enabledCapabilities);
  for (const core of seoCoreCapabilityCodes) requested.add(core);

  const items = allCapabilities.map((code): SeoCapabilityPlanItem => {
    const definition = capabilityDefinition(code);
    const reason = skipReason(code, definition.paid, context, requested);
    return reason === null
      ? {
          capabilityCode: code,
          status: "queued",
          ruleVersion: definition.ruleVersion,
          maxAttempts: definition.maxAttempts
        }
      : {
          capabilityCode: code,
          status: "skipped",
          reason,
          ruleVersion: definition.ruleVersion,
          maxAttempts: definition.maxAttempts
        };
  });
  return { plannerVersion: SEO_PLANNER_VERSION, items };
}

// Preconditions are intentionally explicit so every skipped capability has one formal reason.
// eslint-disable-next-line complexity
function skipReason(
  code: SeoCapabilityCode,
  paid: boolean,
  context: SeoPlanningContext,
  requested: ReadonlySet<SeoCapabilityCode>
): SeoSkipReason | null {
  if (!context.enabledCapabilities.has(code)) return "unsupported";
  if (!requested.has(code)) return "not_applicable";
  if (capabilityDefinition(code).requiresAcquisition && !context.acquisitionAvailable) {
    return "stale_input";
  }
  if (paid && !context.budgetAvailable) return "cost_limit";

  if (code === "performance") {
    if (!context.integrations.has("performance")) return "missing_integration";
    const due = context.dueCapabilities.has(code);
    const forced = ["baseline", "post_deploy"].includes(context.mode);
    if (!due && !forced && !context.previousRegressions.has(code)) return "not_applicable";
  }
  if (code === "visual") {
    if (!context.integrations.has("renderer")) return "missing_integration";
    if (!context.spaDetected && !context.visualRequested) return "not_applicable";
  }
  if (
    code === "google" &&
    !hasAny(context.integrations, ["search_console", "ga4", "google_business"])
  ) {
    return "missing_integration";
  }
  if (code === "local" && !context.hasLocation && !context.hasLocalSignals) {
    return "not_applicable";
  }
  if (code === "maps") {
    if (!context.hasLocation || !context.geogridEnabled || context.activeKeywordCount === 0) {
      return "not_applicable";
    }
    if (!context.integrations.has("dataforseo")) return "missing_integration";
    if (!context.dueCapabilities.has(code) && context.mode === "periodic") return "not_applicable";
  }
  if (code === "competitor") {
    if (context.competitorCount === 0) return "not_applicable";
    if (!context.integrations.has("serp")) return "missing_integration";
  }
  if (code === "backlink" && !context.integrations.has("backlink")) {
    return "missing_integration";
  }
  if (code === "ai_visibility" && !context.integrations.has("ai_visibility")) {
    return "missing_integration";
  }
  if (code === "sxo") {
    if (context.activeKeywordCount === 0) return "not_applicable";
    if (!context.integrations.has("serp")) return "missing_integration";
  }
  if (code === "drift" && !context.baselineAvailable) return "missing_baseline";
  return null;
}

function hasAny(values: ReadonlySet<string>, candidates: readonly string[]): boolean {
  return candidates.some((candidate) => values.has(candidate));
}
