# Arquitetura Supabase/Vercel

Status: aceita em 25/07/2026.

## ADR-014 — Plataforma gerenciada Supabase/Vercel

Substitui ADR-003, ADR-005, ADR-007, ADR-009 e a parte CloudWatch da ADR-010.

- Identidade: Supabase Auth compartilhado com GPT Check por ambiente.
- Dados: Supabase PostgreSQL 17 em `sa-east-1`, Drizzle e RLS explícita.
- Objetos: buckets privados Supabase Storage, nomes imutáveis e hash obrigatório.
- Assíncrono: outbox/inbox com Supabase Queues (`pgmq`), DLQ de aplicação e Supabase Cron.
- Compute: três projetos Vercel em `gru1`: web, API e worker.
- E-mail: Resend via SMTP/API e webhooks assinados.
- Observabilidade: OpenTelemetry, Vercel Observability, Supabase Logs e Sentry.

## ADR-015 — API e workers serverless

NestJS/Fastify continua sendo a fronteira da API. O browser consome um BFF Next.js e não
consulta tabelas de domínio pelo Data API. Workers processam lotes pequenos e retomáveis,
com cursor persistido, limite de tempo por invocação e idempotência.

O scheduler grava apenas a intenção. O relay publica a mensagem na mesma base Postgres.
Consumidores assumem duplicação, revalidam autorização antes de writes e movem poison
messages para DLQ após cinco tentativas.

## ADR-016 — Sessão e autorização

O UUID de `auth.users` é a identidade comum. Sessões web usam cookies HttpOnly, Secure e
SameSite=Lax; tokens não são persistidos em localStorage. JWTs são verificados por JWKS
assimétrico. MFA usa AAL2. Passkeys permanecem sob flag desligada em produção.

Autorização reside em memberships do schema `app`. Toda transação define `app.user_id`,
`app.tenant_id` e `app.system_actor` via `set_config(..., true)`. O papel da aplicação não
possui DDL nem BYPASSRLS.

## ADR-017 — Imutabilidade de objetos e auditoria

Objetos nunca são sobrescritos: a chave contém tenant, entidade, versão e hash. Auditoria é
append-only, encadeada por hash e exportada diariamente. Supabase Storage não oferece
Object Lock; o risco residual é mitigado por privilégios mínimos, retenção lógica, PITR,
manifests assinados e restore trimestral.

## ADR-018 — PostgreSQL 17

O PostgreSQL gerenciado do Supabase usa a linha 17. A especificação que citava a linha 18
foi atualizada. Migrations mantêm compatibilidade forward-only e usam extensões suportadas:
`citext`, `pgcrypto`, `postgis`, `pgmq`, `pg_cron`, `pg_net` e `vault`.
