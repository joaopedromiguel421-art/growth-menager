import type { SeoFindingDraft } from "@growth-manager/domain";
import type { ParsedHtmlDocument } from "../analyzers/html.js";
import { ruleFinding, type SeoRuleContext } from "./findings.js";

const VERSION = "schema-v1";

export function analyzeStructuredData(input: {
  readonly document: ParsedHtmlDocument;
  readonly context: SeoRuleContext;
}): readonly SeoFindingDraft[] {
  const invalidCount = input.document.structuredData.filter((item) => item.error !== null).length;
  if (invalidCount === 0) return [];
  return [
    ruleFinding(input.context, {
      code: "SEO-SCHEMA-INVALID-JSON",
      category: "schema",
      severity: "high",
      title: "JSON-LD inválido",
      description: `${String(invalidCount)} bloco(s) application/ld+json não puderam ser interpretados como JSON.`,
      recommendation: "Corrija a sintaxe e valide o JSON-LD antes de publicar uma nova versão.",
      impactBand: "medium",
      affectedScope: input.document.url,
      capabilityCode: "schema",
      ruleVersion: VERSION
    })
  ];
}
