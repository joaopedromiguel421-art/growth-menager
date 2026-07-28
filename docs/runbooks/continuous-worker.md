# Worker contínuo

O banco agenda itens vencidos e o GitHub Actions chama o endpoint autenticado do worker
a cada cinco minutos. O endpoint drena outbox e filas de publicação, entrega,
renderização e jobs gerais.

## Configuração de produção

O segredo `WORKER_CRON_SECRET` do repositório deve ser idêntico ao `CRON_SECRET` do
projeto do worker na Vercel. O valor nunca é impresso no log.

A migração `202607280004_worker_pump_cron.sql` oferece uma segunda opção pelo Supabase
Cron, com intervalo de dois minutos. Para habilitá-la, crie no Supabase Vault:

- `growth_manager_worker_pump_url`: URL completa terminada em `/api/pump`.
- `growth_manager_worker_cron_secret`: mesmo bearer secreto usado pelo worker.

`app.invoke_worker_pump()` não faz chamada quando um dos valores não existe. Isso permite
aplicar a migração antes de provisionar os segredos sem expor credenciais no repositório.

## Verificação

1. Confirme no GitHub Actions que o workflow `worker-pump` executou nos últimos cinco
   minutos.
2. Se o Supabase Cron estiver habilitado, confirme `growth-manager-worker-pump` em
   `cron.job` e execute `select app.invoke_worker_pump();` para obter o request ID.
3. Confirme que `app.outbox_events.published_at` avançou e que as filas não acumulam.
4. Em falha externa incerta, confira `publication_attempts` antes de reprocessar. O worker
   marca reconciliação necessária e não repete a escrita às cegas.

## Degradação segura

- Sem `FEATURE_REAL_PROVIDERS`, publicações vencidas terminam como `failed` com
  `provider_disabled`; nunca aparecem como publicadas.
- Erros após uma chamada de publicação são registrados e não recebem retry cego.
- Relatórios usam HTML canônico imutável no bucket privado `reports`; links da interface
  são assinados e expiram em uma hora.
