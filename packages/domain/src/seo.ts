import type {
  SeoFinding,
  SeoFindingStatus,
  SeoFindingStatusUpdate
} from "@growth-manager/contracts";
import { DomainError } from "./errors.js";
import { recommendationConfidence } from "./scoring.js";

export const SEO_RULESET_VERSION = "seo-rules-v1";
export const SEO_PLANNER_VERSION = "seo-planner-v1";
export const SEO_CONFIDENCE_FLOOR = 0.4;

export interface SeoFindingDraft
  extends Omit<
    SeoFinding,
    | "id"
    | "tenant_id"
    | "analysis_run_id"
    | "first_seen_at"
    | "last_seen_at"
    | "resolved_at"
    | "version"
    | "status"
  > {
  readonly status?: SeoFindingStatus;
}

export interface ComparableSnapshotIdentity {
  readonly source: string;
  readonly device: string | null;
  readonly location: string | null;
  readonly locale: string;
  readonly keyword: string | null;
  readonly ruleVersion: string;
}

export function seoConfidence(input: {
  readonly coverage: number;
  readonly freshness: number;
  readonly agreement: number;
}): SeoFinding["confidence"] {
  return {
    ...input,
    score: recommendationConfidence(input)
  };
}

export function validateSeoFindingDraft(
  draft: SeoFindingDraft,
  availableEvidenceIds: ReadonlySet<string>
): SeoFindingDraft & { readonly status: SeoFindingStatus } {
  if (draft.evidence_ids.length === 0) {
    throw new DomainError(
      "GM-SEO-EVIDENCE-REQUIRED",
      "O achado precisa de pelo menos uma evidência.",
      false
    );
  }
  const unknownEvidence = draft.evidence_ids.find((id) => !availableEvidenceIds.has(id));
  if (unknownEvidence !== undefined) {
    throw new DomainError(
      "GM-SEO-EVIDENCE-UNKNOWN",
      "O achado referencia uma evidência indisponível.",
      false
    );
  }

  const expected = seoConfidence(draft.confidence);
  if (Math.abs(expected.score - draft.confidence.score) > 0.001) {
    throw new DomainError(
      "GM-SEO-CONFIDENCE-MISMATCH",
      "A confiança do achado não corresponde às evidências.",
      false
    );
  }

  const status =
    expected.score < SEO_CONFIDENCE_FLOOR ? "insufficient_evidence" : (draft.status ?? "open");
  if (status === "insufficient_evidence" && draft.impact.band !== "unknown") {
    throw new DomainError(
      "GM-SEO-IMPACT-UNSUPPORTED",
      "Impacto não pode ser afirmado quando a evidência é insuficiente.",
      false
    );
  }
  return { ...draft, status };
}

const userTransitions: Readonly<Record<SeoFindingStatus, readonly SeoFindingStatus[]>> = {
  open: ["acknowledged", "accepted", "in_progress", "dismissed"],
  acknowledged: ["accepted", "in_progress", "dismissed"],
  accepted: ["in_progress", "dismissed"],
  in_progress: ["dismissed"],
  resolved: [],
  dismissed: ["acknowledged", "accepted"],
  regressed: ["acknowledged", "accepted", "in_progress", "dismissed"],
  superseded: [],
  insufficient_evidence: []
};

export function validateFindingStatusUpdate(
  current: SeoFindingStatus,
  update: SeoFindingStatusUpdate
): void {
  const transitions = userTransitions[current];
  if (!transitions.includes(update.status)) {
    throw new DomainError(
      "GM-SEO-FINDING-STATE",
      `A transição de ${current} para ${update.status} não é permitida.`,
      false
    );
  }
  if (update.status === "dismissed" && update.reason === null) {
    throw new DomainError("GM-SEO-DISMISSAL-REASON", "Informe o motivo do descarte.", false);
  }
}

export function systemFindingStatus(input: {
  readonly current: SeoFindingStatus;
  readonly matched: boolean;
  readonly consecutiveCleanRuns: number;
  readonly criticalAvailabilityOrIndexing: boolean;
}): SeoFindingStatus {
  if (input.matched) {
    return input.current === "resolved" ? "regressed" : input.current;
  }
  if (["dismissed", "superseded", "insufficient_evidence"].includes(input.current)) {
    return input.current;
  }
  const requiredCleanRuns = input.criticalAvailabilityOrIndexing ? 1 : 2;
  return input.consecutiveCleanRuns >= requiredCleanRuns ? "resolved" : input.current;
}

export function areSeoSnapshotsComparable(
  baseline: ComparableSnapshotIdentity,
  current: ComparableSnapshotIdentity
): boolean {
  return (
    baseline.source === current.source &&
    baseline.device === current.device &&
    baseline.location === current.location &&
    baseline.locale === current.locale &&
    baseline.keyword === current.keyword &&
    baseline.ruleVersion === current.ruleVersion
  );
}

export function baselineStatus(coverage: number): "provisional" | "active" {
  if (!Number.isFinite(coverage) || coverage < 0 || coverage > 1) {
    throw new RangeError("coverage must be between 0 and 1");
  }
  return coverage === 1 ? "active" : "provisional";
}
