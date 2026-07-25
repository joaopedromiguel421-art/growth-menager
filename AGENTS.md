# AGENTS.md — Growth Manager

## Contexto

Growth Manager é um SaaS B2B multitenant pós-venda. A fonte de verdade é `/docs` e a
matriz `/docs/traceability-matrix.md`. Mudanças de comportamento atualizam primeiro
especificação, teste e depois código.

## Arquitetura decidida

- Monorepo pnpm/Turborepo e TypeScript strict.
- `apps/web`: Next.js 16.2; `apps/api`: NestJS 11/Fastify; `apps/worker`: consumers
  serverless.
- Supabase Auth/PostgreSQL 17/RLS/Storage/Vault/Queues/Cron; Vercel em `gru1`; Resend.
- Monólito modular/hexagonal. Fluxo: controller/consumer → use case → domínio → port →
  adapter.
- HTML é a fonte de relatórios; PDF é derivado. IA nunca recebe ferramenta de escrita.

## Regras obrigatórias

- Toda tabela de cliente contém `tenant_id NOT NULL`, índice iniciado por tenant e
  `FORCE ROW LEVEL SECURITY`.
- Repositórios exigem `TenantContext`; tenant nunca vem do body.
- Backend valida autenticação, permissão, tenant, estado, versão e step-up.
- JWT, cookies, OAuth tokens, segredos e payloads pessoais nunca entram em logs.
- Writes externos exigem idempotência e reconciliação; resultado incerto não recebe retry
  cego.
- Código técnico em inglês; microcopy em pt-BR; não usar `any`, `@ts-ignore` ou catch vazio.
- Execute a suíte aplicável e `pnpm docs:check` antes de declarar uma tarefa concluída.
