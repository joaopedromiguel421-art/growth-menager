import type { SeoFindingSeverity } from "@growth-manager/contracts";
import type { SeoFindingDraft } from "@growth-manager/domain";
import type { ParsedHtmlDocument } from "../analyzers/html.js";
import { ruleFinding, type SeoRuleContext } from "./findings.js";

const VERSION = "technical-v1";

// Each branch is an independent deterministic rule with its own stable finding code.
// eslint-disable-next-line complexity
export function analyzeTechnicalPage(input: {
  readonly document: ParsedHtmlDocument;
  readonly statusCode: number | null;
  readonly critical: boolean;
  readonly context: SeoRuleContext;
}): readonly SeoFindingDraft[] {
  const findings: SeoFindingDraft[] = [];
  const scope = input.document.url;

  if (input.statusCode !== null && input.statusCode >= 400) {
    const severity: SeoFindingSeverity =
      input.statusCode >= 500 && input.critical ? "critical" : "high";
    findings.push(
      ruleFinding(input.context, {
        code: "SEO-TECH-HTTP-ERROR",
        category: "technical",
        severity,
        title: `A página respondeu HTTP ${String(input.statusCode)}`,
        description: "A resposta observada impede ou limita o acesso à página monitorada.",
        recommendation:
          "Verifique a origem, o deploy e os redirects antes de solicitar nova coleta.",
        impactBand: input.critical ? "high" : "medium",
        affectedScope: scope,
        metricKeys: ["http_status"],
        capabilityCode: "technical",
        ruleVersion: VERSION
      })
    );
  }
  if (input.document.title === null) {
    findings.push(
      ruleFinding(input.context, {
        code: "SEO-TECH-TITLE-MISSING",
        category: "technical",
        severity: "high",
        title: "Title ausente",
        description: "O HTML observado não contém um elemento title com texto.",
        recommendation: "Defina um title descritivo e específico para a página.",
        impactBand: "medium",
        affectedScope: scope,
        capabilityCode: "technical",
        ruleVersion: VERSION
      })
    );
  }
  if (input.document.canonicalUrl === null) {
    findings.push(
      ruleFinding(input.context, {
        code: "SEO-TECH-CANONICAL-MISSING",
        category: "technical",
        severity: "medium",
        title: "Canonical não declarada",
        description: "Nenhuma canonical HTTP(S) válida foi observada no HTML.",
        recommendation: "Revise a URL preferida e declare uma canonical válida quando aplicável.",
        impactBand: "medium",
        affectedScope: scope,
        capabilityCode: "technical",
        ruleVersion: VERSION
      })
    );
  }
  if (input.document.robots.includes("noindex")) {
    findings.push(
      ruleFinding(input.context, {
        code: "SEO-TECH-NOINDEX",
        category: "technical",
        severity: input.critical ? "critical" : "high",
        title: "Diretiva noindex observada",
        description: "A página declarou noindex na coleta atual.",
        recommendation:
          "Confirme se a exclusão do índice é intencional antes de alterar a diretiva.",
        impactBand: input.critical ? "high" : "medium",
        affectedScope: scope,
        capabilityCode: "technical",
        ruleVersion: VERSION
      })
    );
  }
  if (input.document.headings.h1.length === 0) {
    findings.push(
      ruleFinding(input.context, {
        code: "SEO-TECH-H1-MISSING",
        category: "technical",
        severity: "medium",
        title: "H1 não observado",
        description: "O HTML processado não contém heading H1 com texto.",
        recommendation:
          "Revise a hierarquia do conteúdo e inclua um título principal quando apropriado.",
        impactBand: "low",
        affectedScope: scope,
        capabilityCode: "technical",
        ruleVersion: VERSION
      })
    );
  }
  if (input.document.headings.h1.length > 1) {
    findings.push(
      ruleFinding(input.context, {
        code: "SEO-TECH-H1-MULTIPLE",
        category: "technical",
        severity: "low",
        title: "Múltiplos H1 observados",
        description: `A coleta encontrou ${String(input.document.headings.h1.length)} elementos H1 com texto.`,
        recommendation:
          "Revise se a hierarquia comunica um único assunto principal; múltiplos H1 não são erro automático.",
        impactBand: "unknown",
        affectedScope: scope,
        capabilityCode: "technical",
        ruleVersion: VERSION
      })
    );
  }
  if (input.document.language === null) {
    findings.push(
      ruleFinding(input.context, {
        code: "SEO-TECH-LANG-MISSING",
        category: "technical",
        severity: "low",
        title: "Idioma do documento ausente",
        description: "O elemento html não declarou o atributo lang.",
        recommendation: "Declare o idioma principal da página no atributo lang.",
        impactBand: "low",
        affectedScope: scope,
        capabilityCode: "technical",
        ruleVersion: VERSION
      })
    );
  }
  return findings;
}
