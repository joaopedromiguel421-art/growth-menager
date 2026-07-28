# Matriz de rastreabilidade do MVP

Esta matriz separa fundação implementada de comportamento que ainda depende das fases
funcionais. “Modelo” significa schema, contrato ou fronteira criada; não equivale ao aceite
do RF.

| RF     | Capacidade                   | Implementação/evidência atual                                         | Gate |
| ------ | ---------------------------- | --------------------------------------------------------------------- | ---- |
| RF-001 | Autenticação compartilhada   | Supabase Auth, JWKS, cookies BFF, renovação e `/v1/me`                | G1   |
| RF-002 | Tenant e onboarding          | `POST /v1/tenants`, tela de clientes e localidade inicial             | G1   |
| RF-003 | Usuários, convites e papéis  | convite com token hash, tela de equipe e aceite                       | G1   |
| RF-004 | Autorizar integrações        | OAuth Google PKCE/state, Vault e redirects fixos                      | G2   |
| RF-005 | Selecionar propriedades      | GBP, GSC e GA4 com seleção explícita                                  | G2   |
| RF-006 | Saúde da integração          | contrato de health e tela de conexões                                 | G2   |
| RF-007 | Sync e normalização          | GBP/GSC/GA4 reais, raw import, métricas e fila idempotente            | G2   |
| RF-008 | Central de comando           | dashboard tenant-scoped com snapshot de 60 s e loading progressivo    | G2   |
| RF-009 | Decidir recomendação         | endpoint, RBAC, versão, outbox e evidência rastreável                 | G3   |
| RF-010 | Avaliações                   | modelo, RLS e rota/tela reservada                                     | G3   |
| RF-011 | Sugestão de resposta         | jobs IA e evidência modelados                                         | G3   |
| RF-012 | Aprovação                    | endpoint AAL2, versão protegida e outbox                              | G3   |
| RF-013 | Publicar resposta            | job de write, idempotência e reconciliação modelados                  | G3   |
| RF-014 | Conteúdo e versões           | entidades, RLS, assets e tela de módulo                               | G3   |
| RF-015 | Aprovar conteúdo             | approval versionado compartilhado                                     | G3   |
| RF-016 | Agendar/publicar             | cron, fila exclusiva, advisory/estado modelado                        | G3   |
| RF-017 | Oportunidades Search Console | coleta por consulta/página e regras de CTR e queda                    | G2   |
| RF-018 | DataForSEO e IA              | adapters, custo e evidência modelados                                 | G2   |
| RF-019 | Tarefas                      | list/create/update na UI, RBAC, versão e outbox                       | G3   |
| RF-020 | Alertas                      | entidade, RLS e tela de módulo                                        | G3   |
| RF-021 | Fechamento e snapshot        | report/snapshot e job modelados                                       | G4   |
| RF-022 | HTML e PDF                   | fila dedicada e Storage privado modelados                             | G4   |
| RF-023 | Aprovar relatório            | approval/report versionados                                           | G4   |
| RF-024 | Entregar relatório           | Resend adapter, assinatura e delivery modelados                       | G4   |
| RF-025 | Uso e custo                  | usage events e dashboard de custos                                    | G2   |
| RF-026 | Orçamento                    | budgets, limites e feature flags                                      | G2   |
| RF-027 | Converter GPT Check          | identidade compartilhada e conversão modelada                         | G1   |
| RF-028 | Auditoria                    | append-only, cadeia de hash e export modelados                        | G5   |
| RF-029 | Exportar tenant              | job, bucket `exports` e lifecycle modelados                           | G5   |
| RF-030 | Excluir tenant               | estados e janela de exclusão modelados                                | G5   |
| RF-031 | Notificações                 | preferências, notificações e Resend                                   | G5   |
| RF-032 | Diagnóstico e suporte        | grants temporários e health endpoints                                 | G5   |
| RF-033 | Brand kit                    | entidades, assets privados e tela                                     | G3   |
| RF-034 | Analytics e telemetria       | product events, logger redigido e OTEL config                         | G5   |
| RF-035 | Acesso e sessão              | recuperação/MFA modelados; refresh HttpOnly ativo                     | G1   |
| RF-036 | Flags globais                | feature flags e passkeys desligadas                                   | G5   |
| RF-037 | Portal do cliente            | report links/recipients modelados                                     | G4   |
| RF-038 | Link seguro                  | token/hash/expiração modelados                                        | G4   |
| RF-039 | Busca e navegação            | app shell persistente, links cliente, skeletons e movimento reduzível | G0   |
| RF-040 | Reprocessamento              | inbox, cursor, retries, DLQ e reconcile                               | G5   |

## Adendo — monitoramento contínuo de SEO

| ID         | Capacidade                               | Implementação/evidência esperada                            | Gate |
| ---------- | ---------------------------------------- | ----------------------------------------------------------- | ---- |
| SEO-RF-001 | Targets e perfis de monitoramento        | contratos, RLS, API e UI                                    | G1   |
| SEO-RF-002 | Planejamento condicional de capabilities | planner puro, motivos de skip e jobs versionados            | G2   |
| SEO-RF-003 | Aquisição segura e artefatos imutáveis   | SafeFetch, hashes, Storage e raw imports                    | G2   |
| SEO-RF-004 | Achados integralmente evidenciados       | `seo_findings`, validator e relações tenant-aware           | G2   |
| SEO-RF-005 | Baseline, comparação e regressões        | snapshots, baselines e lifecycle determinístico             | G2   |
| SEO-RF-006 | Providers SEO read-only                  | adapters HTTP, fixtures, budget e circuit breaker           | G2   |
| SEO-RF-007 | Síntese governada pela DeepSeek          | prompt registry, JSON estrito, citation verifier e fallback | G2   |
| SEO-RF-008 | Custos, tentativas e histórico           | reservations, usage events, reconciliação e DLQ             | G2   |
| SEO-RF-009 | Acompanhamento de achados e evidências   | API/UI, status, histórico e conversão explícita em tarefa   | G3   |
| SEO-RF-010 | Relatório SEO                            | HTML canônico, PDF derivado e proveniência exibida          | G4   |

Os critérios normativos e casos negativos estão em `docs/seo/`. Escritas externas,
e-commerce, geração de imagens e conteúdo editorial permanecem fora desta entrega.

## Gates automatizados

| Gate  | Evidência executável                                                        |
| ----- | --------------------------------------------------------------------------- |
| G0    | format, lint, typecheck, unit tests, build, OpenAPI e `docs:check`          |
| G1    | pgTAP de RLS/FORCE RLS, JWKS, AAL2 e testes de sessão                       |
| G2    | contract tests dos adapters, freshness e budget                             |
| G3    | testes de versão, idempotência, concorrência e reconciliação                |
| G4    | golden HTML/PDF, destinatário negativo e webhook Resend                     |
| G5    | restore/replay, auditoria, DLQ e runbooks                                   |
| G6–G7 | Lighthouse/Playwright/bundle, acessibilidade, pentest e rollout progressivo |
