/**
 * Deterministic review classification and reply templates.
 *
 * RN-008 explicitly allows a deterministic classifier for sensitive themes, and
 * the product currently ships no AI reply generation at all: every draft comes
 * from one of the three templates below. Both api and worker import this so a
 * review is classified identically wherever it happens to run.
 */

export type ReviewSentiment = "positive" | "neutral" | "negative";

export interface ReviewClassification {
  readonly sentiment: ReviewSentiment;
  readonly sensitiveTheme: boolean;
}

// Portuguese terms for the RN-008 categories: clinical, legal, financial, physical
// safety, discrimination, threat, self-harm and exposed personal data. This is a
// coarse lexicon, not a legal determination — any match routes to a human, which
// is the safe direction to be wrong in.
const SENSITIVE_TERMS: readonly string[] = [
  "diagnóstico",
  "diagnostico",
  "câncer",
  "cancer",
  "cirurgia",
  "overdose",
  "morreu",
  "morte",
  "faleceu",
  "processo judicial",
  "advogado",
  "justiça",
  "justica",
  "boletim de ocorrência",
  "boletim de ocorrencia",
  "denúncia",
  "denuncia",
  "fraude",
  "estelionato",
  "golpe",
  "cartão clonado",
  "cartao clonado",
  "cobrança indevida",
  "cobranca indevida",
  "ameaça",
  "ameaca",
  "agressão",
  "agressao",
  "racismo",
  "discriminação",
  "discriminacao",
  "assédio",
  "assedio",
  "abuso",
  "suicídio",
  "suicidio",
  "se matar",
  "meu cpf",
  "meu endereço",
  "meu endereco",
  "meu telefone"
];

export function classifyReview(input: {
  readonly rating: number;
  readonly body: string | null;
}): ReviewClassification {
  const sentiment: ReviewSentiment =
    input.rating >= 4 ? "positive" : input.rating === 3 ? "neutral" : "negative";
  const normalized = (input.body ?? "").toLowerCase();
  const sensitiveTheme = SENSITIVE_TERMS.some((term) => normalized.includes(term));
  return { sentiment, sensitiveTheme };
}

/**
 * A neutral, non-committal draft by rating band. It never invents a claim about
 * what happened, so it satisfies RN-007's forbidden-content list by construction
 * — there is nothing in it to fact-check, promise, or accuse anyone of.
 */
export function buildReplyTemplate(input: {
  readonly rating: number;
  readonly authorName: string | null;
}): string {
  const name = input.authorName?.trim();
  const greeting = name === undefined || name.length === 0 ? "Olá" : `Olá, ${name}`;

  if (input.rating >= 4) {
    return `${greeting}! Muito obrigado pela avaliação. Ficamos felizes em saber que a experiência foi boa e esperamos atendê-lo(a) novamente em breve.`;
  }
  if (input.rating === 3) {
    return `${greeting}, obrigado por compartilhar sua avaliação. Gostaríamos de entender melhor o que podemos melhorar — se puder, entre em contato conosco para conversarmos com mais detalhes.`;
  }
  return `${greeting}, sentimos muito que sua experiência não tenha sido a que esperávamos. Levamos isso a sério e gostaríamos de conversar diretamente para entender o ocorrido e corrigir o quanto antes.`;
}
