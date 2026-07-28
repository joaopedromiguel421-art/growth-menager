create index if not exists tasks_tenant_open_due_idx
  on app.tasks (tenant_id, due_at)
  where completed_at is null;

drop index if exists app.approvals_tenant_status_idx;
create index if not exists approvals_tenant_status_due_idx
  on app.approvals (tenant_id, status, due_at);

-- Candidate freshness is persisted in integration_connections.metadata so the
-- runtime remains backwards-compatible while these tenant-first indexes roll out.
-- Existing policies remain authoritative and FORCE RLS remains mandatory.
alter table app.integration_connections force row level security;
alter table app.tasks force row level security;
alter table app.approvals force row level security;
