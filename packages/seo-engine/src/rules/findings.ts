import type { SeoFindingCategory, SeoFindingSeverity } from "@growth-manager/contracts";
import { seoConfidence, type SeoFindingDraft } from "@growth-manager/domain";

export interface SeoRuleContext {
  readonly targetId: string;
  readonly evidenceId: string;
  readonly capturedAt: string;
  readonly source: string;
  readonly coverage: number;
  readonly freshness: number;
  readonly agreement: number;
}

export function ruleFinding(
  context: SeoRuleContext,
  input: {
    readonly code: string;
    readonly category: SeoFindingCategory;
    readonly severity: SeoFindingSeverity;
    readonly title: string;
    readonly description: string;
    readonly recommendation: string;
    readonly impactBand: "high" | "medium" | "low" | "unknown";
    readonly affectedScope: string;
    readonly metricKeys?: readonly string[];
    readonly capabilityCode: SeoFindingDraft["origin"]["capability_code"];
    readonly ruleVersion: string;
  }
): SeoFindingDraft {
  return {
    target_id: context.targetId,
    code: input.code,
    category: input.category,
    severity: input.severity,
    title: input.title,
    description: input.description,
    confidence: seoConfidence({
      coverage: context.coverage,
      freshness: context.freshness,
      agreement: context.agreement
    }),
    evidence_ids: [context.evidenceId],
    origin: {
      capability_code: input.capabilityCode,
      source: context.source,
      provider: null,
      rule_version: input.ruleVersion,
      prompt_version: null,
      captured_at: context.capturedAt
    },
    recommendation: input.recommendation,
    impact: {
      band: input.impactBand,
      affected_scope: input.affectedScope,
      metric_keys: [...(input.metricKeys ?? [])]
    }
  };
}
