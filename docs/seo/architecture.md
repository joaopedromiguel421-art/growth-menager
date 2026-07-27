# Arquitetura normativa — monitoramento contínuo de SEO

**Status:** aceita para implementação
**Referência analisada:** `AgriciDaniel/claude-seo` no commit
`09d37c7b66ed3ca9c6efbdb765a805a6c76a8f01` (`v2.2.4-1-g09d37c7`).

## Objetivo

Incorporar ao Growth Manager monitoramento pós-venda de SEO técnico, conteúdo,
Schema, performance, Google Business Profile, SEO local, Maps/GeoGrid,
concorrentes, backlinks, visibilidade em mecanismos de IA e drift temporal.
O repositório de referência fornece metodologia e casos de teste; não é instalado,
executado ou distribuído como componente do produto.

## Fronteiras obrigatórias

- O módulo segue controller/consumer → use case → domínio → port → adapter.
- Skills são `SeoCapabilityDefinition` versionadas; agentes são workflows backend.
- MCPs são substituídos por adapters HTTP explícitos e read-only.
- Scripts determinísticos são reimplementados em TypeScript strict.
- A IA nunca recebe rede, banco, credencial, ferramenta ou capacidade de escrita.
- Nenhuma publicação, IndexNow, alteração de Schema ou modificação do site integra a
  primeira onda.
- HTML permanece a fonte canônica dos relatórios e PDF é derivado.
- Todo dado de cliente carrega tenant e é acessado dentro de `TenantContext`.

## Fluxo

1. A API valida tenant, permissão, target, perfil e idempotência.
2. O planner cruza trigger, integrações, baseline, keywords, localizações e budget.
3. O worker adquire cada recurso uma vez por SafeFetch ou adapter de renderização.
4. Capabilities determinísticas são executadas em fan-out condicional.
5. O finding validator rejeita fatos sem evidência, origem ou cobertura mínima.
6. DeepSeek pode explicar achados validados, sem criar métricas ou severidade.
7. O agregador compara baseline, atualiza lifecycle e produz relatório/histórico.

## Capabilities

Sempre após aquisição válida: `technical`, `content`, `schema`, `sitemap`.

Condicionais: `performance`, `visual`, `google`, `local`, `maps`, `competitor`,
`backlink`, `ai_visibility`, `sxo` e `drift`. Uma execução não aplicável registra
`skipped` com motivo, sem ser tratada como falha.

## Aquisição híbrida

Fetch HTTP seguro é o padrão. Renderização externa é permitida para SPA, divergência
HTML/render ou auditoria visual explícita. Todas as resoluções DNS, redirects,
protocolos, tamanhos e content types são validados centralmente. Chromium próprio não
é requisito do runtime serverless inicial.

## Compatibilidade

A entrega usa migrations expand-contract e endpoints aditivos em
`/v1/tenants/:tenantId/seo`. Consumers compatíveis são publicados antes de producers.
Feature flags desligam o módulo, providers individuais, DeepSeek e criação de tarefas.
