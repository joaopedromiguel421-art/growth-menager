import { readFile } from "node:fs/promises";

const requiredFiles = [
  "AGENTS.md",
  "docs/Especificacao_Mestre_Growth_Manager_v1.1.md",
  "docs/architecture-supabase-vercel.md",
  "docs/traceability-matrix.md",
  "docs/seo/architecture.md",
  "docs/seo/evidence-policy.md",
  "docs/seo/provider-and-license-registry.md",
  "docs/seo/rule-catalog.md",
  "docs/seo/rollout.md",
  "THIRD_PARTY_NOTICES.md"
];

const forbiddenArchitectureTerms = [
  "Amazon Cognito",
  "ECS Fargate",
  "AWS Secrets Manager",
  "POST /webhooks/v1/ses"
];

for (const file of requiredFiles) {
  await readFile(file, "utf8");
}

const architecture = await readFile("docs/architecture-supabase-vercel.md", "utf8");
for (const term of forbiddenArchitectureTerms) {
  if (architecture.includes(term)) {
    throw new Error(`Obsolete architecture term in accepted ADRs: ${term}`);
  }
}

const specification = await readFile("docs/Especificacao_Mestre_Growth_Manager_v1.1.md", "utf8");
if (!specification.includes("**Versão do documento:** 1.1.0")) {
  throw new Error("The normative specification is not revision 1.1.0.");
}
const requirements = new Set(specification.match(/^### RF-\d{3}/gm) ?? []);
if (requirements.size !== 40) {
  throw new Error(`Expected 40 functional requirements, found ${requirements.size}.`);
}

const seoArchitecture = await readFile("docs/seo/architecture.md", "utf8");
if (!seoArchitecture.includes("09d37c7b66ed3ca9c6efbdb765a805a6c76a8f01")) {
  throw new Error("SEO reference commit is not pinned in the normative architecture.");
}
const seoEvidence = await readFile("docs/seo/evidence-policy.md", "utf8");
for (const field of [
  "código estável",
  "categoria",
  "severidade",
  "confiança",
  "evidências",
  "origem",
  "recomendação",
  "impacto",
  "status"
]) {
  if (!seoEvidence.includes(field)) {
    throw new Error(`SEO evidence policy is missing required finding field: ${field}`);
  }
}

console.log(`Documentation check passed (${requiredFiles.length} required files).`);
