export interface SeoComparablePageSnapshot {
  readonly url: string;
  readonly statusCode: number | null;
  readonly title: string | null;
  readonly description: string | null;
  readonly canonicalUrl: string | null;
  readonly robots: readonly string[];
  readonly h1: readonly string[];
  readonly contentSha256: string | null;
  readonly schemaSha256: string | null;
  readonly structuredDataCount: number;
}

export type SeoDriftKind =
  | "http_error_introduced"
  | "noindex_added"
  | "canonical_removed"
  | "canonical_changed"
  | "title_removed"
  | "title_changed"
  | "description_changed"
  | "h1_removed"
  | "h1_changed"
  | "schema_removed"
  | "schema_changed"
  | "content_changed";

export interface SeoDriftEvent {
  readonly kind: SeoDriftKind;
  readonly severity: "critical" | "high" | "medium" | "low" | "info";
  readonly before: unknown;
  readonly after: unknown;
}

// The explicit branches form the versioned drift rule catalogue and remain auditable one by one.
// eslint-disable-next-line complexity
export function comparePageSnapshots(
  baseline: SeoComparablePageSnapshot,
  current: SeoComparablePageSnapshot,
  critical: boolean
): readonly SeoDriftEvent[] {
  if (baseline.url !== current.url) throw new TypeError("Snapshots must refer to the same URL.");
  const events: SeoDriftEvent[] = [];
  const baselineHealthy = baseline.statusCode !== null && baseline.statusCode < 400;
  const currentError = current.statusCode !== null && current.statusCode >= 400;
  if (baselineHealthy && currentError) {
    events.push(
      event(
        "http_error_introduced",
        critical ? "critical" : "high",
        baseline.statusCode,
        current.statusCode
      )
    );
  }
  if (!baseline.robots.includes("noindex") && current.robots.includes("noindex")) {
    events.push(
      event("noindex_added", critical ? "critical" : "high", baseline.robots, current.robots)
    );
  }
  if (baseline.canonicalUrl !== null && current.canonicalUrl === null) {
    events.push(event("canonical_removed", "high", baseline.canonicalUrl, null));
  } else if (
    baseline.canonicalUrl !== null &&
    current.canonicalUrl !== null &&
    baseline.canonicalUrl !== current.canonicalUrl
  ) {
    events.push(event("canonical_changed", "high", baseline.canonicalUrl, current.canonicalUrl));
  }
  if (baseline.title !== null && current.title === null) {
    events.push(event("title_removed", "high", baseline.title, null));
  } else if (baseline.title !== current.title) {
    events.push(event("title_changed", "medium", baseline.title, current.title));
  }
  if (baseline.description !== current.description) {
    events.push(event("description_changed", "low", baseline.description, current.description));
  }
  if (baseline.h1.length > 0 && current.h1.length === 0) {
    events.push(event("h1_removed", "high", baseline.h1, current.h1));
  } else if (!sameStrings(baseline.h1, current.h1)) {
    events.push(event("h1_changed", "medium", baseline.h1, current.h1));
  }
  if (baseline.structuredDataCount > 0 && current.structuredDataCount === 0) {
    events.push(event("schema_removed", "medium", baseline.structuredDataCount, 0));
  } else if (
    baseline.schemaSha256 !== null &&
    current.schemaSha256 !== null &&
    baseline.schemaSha256 !== current.schemaSha256
  ) {
    events.push(event("schema_changed", "low", baseline.schemaSha256, current.schemaSha256));
  }
  if (
    baseline.contentSha256 !== null &&
    current.contentSha256 !== null &&
    baseline.contentSha256 !== current.contentSha256
  ) {
    events.push(event("content_changed", "info", baseline.contentSha256, current.contentSha256));
  }
  return events;
}

function event(
  kind: SeoDriftKind,
  severity: SeoDriftEvent["severity"],
  before: unknown,
  after: unknown
): SeoDriftEvent {
  return { kind, severity, before, after };
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
