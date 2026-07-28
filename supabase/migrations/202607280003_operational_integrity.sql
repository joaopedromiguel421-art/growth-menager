-- Close tenant-index gaps in legacy join and scheduler tables before exposing
-- the operational modules through the API.
alter table app.content_assets add column if not exists tenant_id uuid references app.tenants(id);

update app.content_assets ca
set tenant_id = ci.tenant_id
from app.content_items ci
where ca.content_item_id = ci.id
  and ca.tenant_id is null;

alter table app.content_assets alter column tenant_id set not null;
create index if not exists content_assets_tenant_item_idx
  on app.content_assets (tenant_id, content_item_id);

alter table app.content_assets enable row level security;
alter table app.content_assets force row level security;
drop policy if exists content_assets_tenant_isolation on app.content_assets;
create policy content_assets_tenant_isolation on app.content_assets
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

-- Global publication scans remain supported, while tenant-scoped API queries
-- no longer need to walk an index that starts with status.
create index if not exists publications_tenant_status_schedule_idx
  on app.publications (tenant_id, status, scheduled_at);
create index if not exists report_snapshots_tenant_report_idx
  on app.report_snapshots (tenant_id, report_id);
create index if not exists notifications_tenant_user_read_idx
  on app.notifications (tenant_id, user_id, read_at, created_at desc);
create index if not exists publication_attempts_tenant_publication_idx
  on app.publication_attempts (tenant_id, publication_id);
create index if not exists report_deliveries_tenant_status_idx
  on app.report_deliveries (tenant_id, status, created_at);
create index if not exists report_deliveries_tenant_report_recipient_idx
  on app.report_deliveries (tenant_id, report_id, recipient_id);
