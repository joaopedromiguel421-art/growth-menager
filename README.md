# Growth Manager

SaaS B2B multitenant para transformar sinais orgânicos em prioridades explicáveis,
execução aprovada e relatórios mensais.

## Stack

- Next.js 16.2, NestJS 11/Fastify e TypeScript strict em monorepo pnpm/Turborepo.
- Supabase Auth, PostgreSQL 17, RLS, Storage, Vault, Queues e Cron.
- Vercel Functions/CDN/Firewall em `gru1`.
- Resend para e-mail; adapters versionados para Google, Meta, DataForSEO e DeepSeek.

## Desenvolvimento

Requisitos: Node.js 24, pnpm 10, Docker Desktop e Supabase CLI.

```bash
corepack enable
pnpm install --frozen-lockfile
supabase start
pnpm db:migrate
pnpm dev
```

Sem credenciais externas, os adapters usam fakes determinísticos. Dados reais nunca devem
ser usados em desenvolvimento ou teste.

## Qualidade

```bash
pnpm ci
```

A especificação normativa está em
[`docs/Especificacao_Mestre_Growth_Manager_v1.1.md`](docs/Especificacao_Mestre_Growth_Manager_v1.1.md).
