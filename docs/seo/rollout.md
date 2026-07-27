# Rollout do módulo SEO

## Ordem expand-contract

1. Documentação, contratos e migrations aditivas.
2. Consumers capazes de ignorar/registrar jobs novos com segurança.
3. Motor determinístico e providers fake.
4. Producers/API sob `FEATURE_SEO_MONITORING`.
5. Providers reais isolados por flags.
6. DeepSeek em shadow mode.
7. UI, relatórios e conversão explícita em tarefas.

## Gates

- `pnpm ci`, testes de banco/RLS e `pnpm docs:check`.
- Zero acesso cross-tenant nas tabelas SEO.
- Zero claim factual sem evidência nos testes e shadow runs.
- Budget reservado antes de provider pago e reconciliado depois.
- Baseline parcial não pode gerar resolução/regressão.
- Nenhum runtime Python, MCP ou componente Claude Code em produção.
- Revisão jurídica de DeepSeek, providers e OSM antes do piloto externo.

## Exposição

Tenant interno → shadow mode → canary 10% → 25% → 100%. Há kill switch para o
módulo, cada provider, DeepSeek e criação automática de tarefas. Escritas externas
permanecem desabilitadas.
