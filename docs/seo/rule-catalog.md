# Catálogo inicial de regras e execução SEO

## Planejamento condicional

| Capability                                  | Condição                                                         |
| ------------------------------------------- | ---------------------------------------------------------------- |
| `technical`, `content`, `schema`, `sitemap` | aquisição válida                                                 |
| `performance`                               | baseline, mensal, pós-deploy, regressão ou página crítica        |
| `visual`                                    | SPA, divergência render, auditoria visual ou pedido explícito    |
| `google`                                    | conexão e propriedade ativa                                      |
| `local`                                     | location/GBP/NAP/sinais locais                                   |
| `maps`                                      | local + keyword + grade + cadência + budget                      |
| `competitor`                                | concorrente configurado ou descoberta autorizada                 |
| `backlink`                                  | baseline, mensal, manual ou mudança relevante + fonte disponível |
| `ai_visibility`                             | provider configurado e cadência atingida                         |
| `sxo`                                       | keyword e SERP atuais                                            |
| `drift`                                     | baseline comparável                                              |

Motivos de skip: `not_applicable`, `missing_integration`, `missing_baseline`,
`stale_input`, `cost_limit`, `permission`, `provider_unavailable`, `unsupported`.

## Ruleset técnico inicial

- Falha HTTP em URL crítica, `noindex` novo e canonical removido são verificações
  determinísticas de alta prioridade.
- Title, description, headings, links e Schema são comparados com snapshot compatível.
- Mudança de H1, conteúdo ou Schema não é crítica por si só; contexto e escopo definem a
  severidade.
- Robots e sitemap são descobertos e validados sem presumir que ausência é erro universal.
- Métricas de performance mantêm dispositivo, origem, período e qualidade.
- Posições mantêm localização, idioma, dispositivo, provider e data; não há interpolação.

## Cadência padrão

Diária para disponibilidade/indexabilidade crítica; semanal para amostra técnica,
Schema, conteúdo, performance e drift; mensal para crawl ampliado, backlinks,
concorrentes e AI visibility. GeoGrid semanal só quando configurado e financiado.
