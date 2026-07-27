import { describe, expect, it } from "vitest";
import { comparePageSnapshots, type SeoComparablePageSnapshot } from "./compare.js";

const baseline: SeoComparablePageSnapshot = {
  url: "https://example.com/",
  statusCode: 200,
  title: "Início",
  description: "Descrição",
  canonicalUrl: "https://example.com/",
  robots: ["index", "follow"],
  h1: ["Início"],
  contentSha256: "a".repeat(64),
  schemaSha256: "b".repeat(64),
  structuredDataCount: 1
};

describe("SEO drift", () => {
  it("flags a new noindex on a critical page as critical", () => {
    const events = comparePageSnapshots(
      baseline,
      { ...baseline, robots: ["noindex", "follow"] },
      true
    );
    expect(events).toContainEqual(
      expect.objectContaining({ kind: "noindex_added", severity: "critical" })
    );
  });

  it("does not claim every schema change is critical", () => {
    const events = comparePageSnapshots(
      baseline,
      { ...baseline, schemaSha256: "c".repeat(64) },
      false
    );
    expect(events).toContainEqual(
      expect.objectContaining({ kind: "schema_changed", severity: "low" })
    );
  });
});
