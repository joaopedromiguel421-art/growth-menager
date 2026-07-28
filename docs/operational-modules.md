# Módulos operacionais

Este documento define o recorte executável de Conteúdo, Calendário, Alertas, Relatórios,
Custos e Identidade da marca. Todas as rotas são tenant-scoped; o tenant vem do contexto
autenticado e nunca do corpo da requisição.

## Contratos de comportamento

- Conteúdo mantém versões imutáveis. Toda edição exige `version` atual, cria uma nova
  `content_version` e incrementa `current_version` e `version` de forma atômica.
- Calendário agenda somente a versão atual de um conteúdo aprovado. Reagendar ou cancelar
  exige `version`; uma publicação iniciada ou concluída não pode ser alterada às cegas.
- Alertas podem ser reconhecidos ou resolvidos. A transição exige a versão atual e registra
  o usuário responsável.
- Custos agregam `usage_events` por provedor no mês solicitado. Orçamentos têm limite de
  aviso menor ou igual ao limite rígido e vigência explícita.
- Identidade da marca possui um único kit ativo por tenant. Atualizações exigem versão;
  listas e tokens visuais usam JSON validado.
- Relatórios são únicos por tenant e período. A criação idempotente enfileira a geração;
  renderização e entrega permanecem jobs separados e reconciliáveis.

## Segurança e falhas

- Leituras e escritas exigem as permissões já definidas para conteúdo, relatórios e custos.
- Todas as tabelas de cliente preservam `tenant_id`, índice iniciado por tenant e RLS
  forçada conforme as migrações normativas.
- Escritas recebem `Idempotency-Key`; conflitos de versão retornam erro de domínio sem
  sobrescrever dados.
- Publicação externa não recebe retry cego quando o resultado do provedor é incerto.
