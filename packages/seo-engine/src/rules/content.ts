import type { SeoFindingDraft } from "@growth-manager/domain";
import type { ParsedHtmlDocument } from "../analyzers/html.js";
import { ruleFinding, type SeoRuleContext } from "./findings.js";

const VERSION = "content-v1";

export function analyzeContentPage(input: {
  readonly document: ParsedHtmlDocument;
  readonly context: SeoRuleContext;
}): readonly SeoFindingDraft[] {
  const findings: SeoFindingDraft[] = [];
  if (input.document.wordCount === 0) {
    findings.push(
      ruleFinding(input.context, {
        code: "SEO-CONTENT-EMPTY",
        category: "content",
        severity: "high",
        title: "Conteúdo textual não observado",
        description: "Depois de remover scripts e estilos, a coleta não encontrou texto no body.",
        recommendation:
          "Confirme a renderização e se a página entrega conteúdo significativo aos visitantes.",
        impactBand: "high",
        affectedScope: input.document.url,
        capabilityCode: "content",
        ruleVersion: VERSION
      })
    );
  }
  if (input.document.description === null) {
    findings.push(
      ruleFinding(input.context, {
        code: "SEO-CONTENT-DESCRIPTION-MISSING",
        category: "content",
        severity: "low",
        title: "Meta description ausente",
        description: "Nenhuma meta description com conteúdo foi observada.",
        recommendation:
          "Escreva uma descrição factual e alinhada ao conteúdo quando a página for indexável.",
        impactBand: "unknown",
        affectedScope: input.document.url,
        capabilityCode: "content",
        ruleVersion: VERSION
      })
    );
  }
  return findings;
}

export function findDuplicateTitles(
  documents: readonly ParsedHtmlDocument[]
): ReadonlyMap<string, readonly string[]> {
  const grouped = new Map<string, string[]>();
  for (const document of documents) {
    if (document.title === null) continue;
    const key = document.title.trim().toLocaleLowerCase();
    const urls = grouped.get(key) ?? [];
    urls.push(document.url);
    grouped.set(key, urls);
  }
  return new Map([...grouped].filter((entry) => entry[1].length > 1));
}
