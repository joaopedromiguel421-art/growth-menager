import { readFile } from "node:fs/promises";

const requiredFiles = [
  "AGENTS.md",
  "docs/Especificacao_Mestre_Growth_Manager_v1.1.md",
  "docs/architecture-supabase-vercel.md",
  "docs/traceability-matrix.md"
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

console.log(`Documentation check passed (${requiredFiles.length} required files).`);
