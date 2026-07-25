begin;

create table app.integration_connections (
  id uuid primary key,
  tenant_id uuid not null references app.tenants(id),
  provider varchar(32) not null,
  status varchar(24) not null default 'disconnected',
  secret_ref varchar(512),
  scopes text[] not null default '{}',
  authorized_by uuid references app.users(id),
  authorized_at timestamptz,
  expires_at timestamptz,
  last_synced_at timestamptz,
  error_code varchar(80),
  consent_version varchar(32),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  unique (tenant_id, provider)
);
create index integration_connections_status_expires_idx
  on app.integration_connections (status, expires_at);

create table app.integration_properties (
  id uuid primary key,
  connection_id uuid not null references app.integration_connections(id),
  tenant_id uuid not null references app.tenants(id),
  kind varchar(40) not null,
  external_id varchar(255) not null,
  name varchar(255) not null,
  location_id uuid references app.locations(id),
  selected boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  unique (connection_id, kind, external_id)
);
create index integration_properties_tenant_kind_idx
  on app.integration_properties (tenant_id, kind, selected);

create table app.sync_jobs (
  id uuid primary key,
  tenant_id uuid not null references app.tenants(id),
  connection_id uuid references app.integration_connections(id),
  provider varchar(32) not null,
  job_type varchar(64) not null,
  status varchar(24) not null,
  cursor jsonb,
  idempotency_key varchar(160) not null,
  attempt smallint not null default 0,
  requested_by uuid references app.users(id),
  started_at timestamptz,
  finished_at timestamptz,
  next_retry_at timestamptz,
  records_read integer not null default 0,
  records_written integer not null default 0,
  records_rejected integer not null default 0,
  error jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  unique (tenant_id, idempotency_key)
);
create index sync_jobs_status_retry_idx on app.sync_jobs (status, next_retry_at);

create table app.webhook_events (
  id uuid primary key,
  provider varchar(32) not null,
  external_event_id varchar(255) not null,
  tenant_id uuid references app.tenants(id),
  received_at timestamptz not null default now(),
  occurred_at timestamptz,
  signature_valid boolean not null,
  payload_ref varchar(512) not null,
  payload_sha256 char(64) not null,
  status varchar(24) not null default 'received',
  attempt smallint not null default 0,
  processed_at timestamptz,
  unique (provider, external_event_id)
);
create index webhook_events_status_received_idx on app.webhook_events (status, received_at);

create table app.raw_imports (
  id uuid primary key,
  tenant_id uuid not null references app.tenants(id),
  provider varchar(32) not null,
  resource_type varchar(64) not null,
  resource_id varchar(255) not null,
  captured_at timestamptz not null,
  object_key varchar(512) not null unique,
  sha256 char(64) not null,
  schema_version varchar(32) not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1
);
create index raw_imports_tenant_provider_captured_idx
  on app.raw_imports (tenant_id, provider, captured_at desc);

create table app.metric_snapshots (
  id uuid primary key,
  tenant_id uuid not null references app.tenants(id),
  location_id uuid references app.locations(id),
  source varchar(32) not null,
  metric varchar(80) not null,
  dimension_hash char(64) not null,
  dimensions jsonb not null default '{}'::jsonb,
  period_start date not null,
  period_end date not null,
  value numeric(20,6) not null,
  unit varchar(32) not null,
  observed_at timestamptz not null,
  quality varchar(20) not null,
  raw_import_id uuid references app.raw_imports(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  unique (tenant_id, source, metric, dimension_hash, period_start, period_end)
);
create index metric_snapshots_tenant_metric_period_idx
  on app.metric_snapshots (tenant_id, metric, period_end desc);
create index metric_snapshots_observed_brin
  on app.metric_snapshots using brin (observed_at);

create table app.evidence (
  id uuid primary key,
  tenant_id uuid not null references app.tenants(id),
  source varchar(32) not null,
  source_ref varchar(512) not null,
  captured_at timestamptz not null,
  title varchar(255) not null,
  excerpt text,
  facts jsonb not null,
  sha256 char(64) not null,
  fresh_until timestamptz,
  raw_import_id uuid references app.raw_imports(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  unique (tenant_id, sha256)
);

create table app.usage_events (
  id uuid primary key,
  tenant_id uuid not null references app.tenants(id),
  provider varchar(32) not null,
  operation varchar(80) not null,
  request_id varchar(160) not null,
  quantity numeric(20,6) not null,
  unit varchar(32) not null,
  cost numeric(14,6) not null default 0,
  currency char(3) not null default 'USD',
  occurred_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  unique (provider, request_id, operation)
);
create index usage_events_tenant_occurred_idx on app.usage_events (tenant_id, occurred_at);

create table app.budgets (
  id uuid primary key,
  tenant_id uuid not null references app.tenants(id),
  provider varchar(32) not null,
  period varchar(16) not null default 'monthly',
  soft_limit numeric(14,4) not null,
  hard_limit numeric(14,4) not null,
  currency char(3) not null,
  essential_override boolean not null default false,
  effective_from date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  unique (tenant_id, provider, effective_from),
  check (hard_limit >= soft_limit and soft_limit >= 0)
);

create table app.ai_runs (
  id uuid primary key,
  tenant_id uuid not null references app.tenants(id),
  use_case varchar(64) not null,
  provider varchar(32) not null,
  model varchar(80) not null,
  prompt_version varchar(64) not null,
  input_sha256 char(64) not null,
  status varchar(24) not null,
  confidence numeric(5,4),
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost numeric(14,6) not null default 0,
  latency_ms integer,
  output jsonb,
  validation_errors jsonb,
  requested_by uuid references app.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1
);
create index ai_runs_tenant_use_case_idx on app.ai_runs (tenant_id, use_case, created_at desc);

create table app.recommendations (
  id uuid primary key,
  tenant_id uuid not null references app.tenants(id),
  title varchar(200) not null,
  description text not null,
  category varchar(40) not null,
  status varchar(24) not null default 'open',
  priority_score smallint not null check (priority_score between 0 and 100),
  impact numeric(5,4) not null check (impact between 0 and 1),
  confidence numeric(5,4) not null check (confidence between 0 and 1),
  urgency numeric(5,4) not null check (urgency between 0 and 1),
  alignment numeric(5,4) not null check (alignment between 0 and 1),
  effort numeric(5,4) not null check (effort between 0 and 1),
  risk varchar(20) not null,
  rationale text not null,
  expires_at timestamptz,
  generated_by varchar(20) not null,
  ai_run_id uuid references app.ai_runs(id),
  accepted_at timestamptz,
  dismissed_at timestamptz,
  dismissal_reason varchar(500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1
);
create index recommendations_tenant_status_score_idx
  on app.recommendations (tenant_id, status, priority_score desc);

create table app.recommendation_evidence (
  recommendation_id uuid not null references app.recommendations(id),
  evidence_id uuid not null references app.evidence(id),
  position smallint not null,
  claim varchar(500) not null,
  primary key (recommendation_id, evidence_id),
  unique (recommendation_id, position)
);

create table app.tasks (
  id uuid primary key,
  tenant_id uuid not null references app.tenants(id),
  recommendation_id uuid references app.recommendations(id),
  title varchar(200) not null,
  description text,
  status varchar(24) not null default 'backlog',
  priority varchar(16) not null default 'medium',
  assignee_id uuid references app.users(id),
  due_at timestamptz,
  source varchar(32) not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1
);
create index tasks_tenant_status_due_idx on app.tasks (tenant_id, status, due_at);

create table app.task_activities (
  id uuid primary key,
  tenant_id uuid not null references app.tenants(id),
  task_id uuid not null references app.tasks(id),
  actor_id uuid references app.users(id),
  action varchar(40) not null,
  from_status varchar(24),
  to_status varchar(24),
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index task_activities_task_created_idx on app.task_activities (task_id, created_at);

create table app.approvals (
  id uuid primary key,
  tenant_id uuid not null references app.tenants(id),
  subject_type varchar(40) not null,
  subject_id uuid not null,
  subject_version integer not null,
  risk varchar(20) not null,
  status varchar(24) not null default 'pending',
  requested_by uuid not null references app.users(id),
  assigned_to uuid references app.users(id),
  due_at timestamptz,
  decided_by uuid references app.users(id),
  decided_at timestamptz,
  decision_note varchar(1000),
  content_sha256 char(64) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1
);
create unique index approvals_pending_subject_uq
  on app.approvals (tenant_id, subject_type, subject_id, subject_version)
  where status = 'pending';
create index approvals_tenant_status_idx on app.approvals (tenant_id, status);

create table app.alerts (
  id uuid primary key,
  tenant_id uuid not null references app.tenants(id),
  type varchar(64) not null,
  severity varchar(16) not null,
  status varchar(20) not null default 'open',
  title varchar(200) not null,
  details jsonb not null,
  dedupe_key varchar(160) not null,
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  occurrences integer not null default 1,
  acknowledged_by uuid references app.users(id),
  resolved_by uuid references app.users(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1
);
create unique index alerts_open_dedupe_uq on app.alerts (tenant_id, dedupe_key)
  where status in ('open', 'acknowledged');

create table app.reviews (
  id uuid primary key,
  tenant_id uuid not null references app.tenants(id),
  location_id uuid references app.locations(id),
  provider varchar(32) not null,
  external_id varchar(255) not null,
  author_name varchar(160),
  rating smallint not null check (rating between 1 and 5),
  body text,
  published_at timestamptz not null,
  updated_external_at timestamptz,
  sentiment varchar(16),
  sensitive_theme boolean not null default false,
  reply_status varchar(24) not null default 'none',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  unique (provider, external_id)
);
create index reviews_tenant_published_idx on app.reviews (tenant_id, published_at desc);

create table app.review_replies (
  id uuid primary key,
  tenant_id uuid not null references app.tenants(id),
  review_id uuid not null references app.reviews(id),
  body text not null check (length(body) between 1 and 4096),
  status varchar(24) not null,
  version integer not null,
  created_by uuid references app.users(id),
  approved_by uuid references app.users(id),
  external_reply_id varchar(255),
  published_at timestamptz,
  failure_code varchar(80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (review_id, version)
);

create table app.brand_kits (
  id uuid primary key,
  tenant_id uuid not null references app.tenants(id),
  name varchar(160) not null,
  voice text not null,
  audiences jsonb not null,
  allowed_claims jsonb not null default '[]'::jsonb,
  forbidden_claims jsonb not null default '[]'::jsonb,
  visual_tokens jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1
);
create unique index brand_kits_active_uq on app.brand_kits (tenant_id) where is_active;

create table app.content_items (
  id uuid primary key,
  tenant_id uuid not null references app.tenants(id),
  channel varchar(24) not null,
  type varchar(32) not null,
  title varchar(200) not null,
  status varchar(24) not null,
  scheduled_at timestamptz,
  timezone varchar(64) not null,
  owner_id uuid references app.users(id),
  brand_kit_id uuid references app.brand_kits(id),
  campaign varchar(120),
  current_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1
);
create index content_items_tenant_status_schedule_idx
  on app.content_items (tenant_id, status, scheduled_at);

create table app.content_versions (
  id uuid primary key,
  tenant_id uuid not null references app.tenants(id),
  content_item_id uuid not null references app.content_items(id),
  version integer not null,
  body text not null,
  metadata jsonb not null,
  created_by uuid references app.users(id),
  prompt_version varchar(64),
  sha256 char(64) not null,
  created_at timestamptz not null default now(),
  unique (content_item_id, version)
);

create table app.assets (
  id uuid primary key,
  tenant_id uuid not null references app.tenants(id),
  object_key varchar(512) not null unique,
  filename varchar(255) not null,
  mime_type varchar(120) not null,
  size_bytes bigint not null check (size_bytes between 1 and 20971520),
  sha256 char(64) not null,
  width integer,
  height integer,
  alt_text varchar(500),
  scan_status varchar(20) not null default 'pending',
  uploaded_by uuid not null references app.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  unique (tenant_id, sha256)
);

create table app.content_assets (
  content_item_id uuid not null references app.content_items(id),
  asset_id uuid not null references app.assets(id),
  position smallint not null,
  role varchar(24) not null,
  primary key (content_item_id, asset_id),
  unique (content_item_id, position)
);

create table app.publications (
  id uuid primary key,
  tenant_id uuid not null references app.tenants(id),
  content_item_id uuid not null references app.content_items(id),
  content_version integer not null,
  provider varchar(32) not null,
  property_id uuid not null references app.integration_properties(id),
  status varchar(24) not null,
  scheduled_at timestamptz not null,
  idempotency_key varchar(160) not null,
  external_id varchar(255),
  last_attempt_at timestamptz,
  published_at timestamptz,
  failure_code varchar(80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  unique (tenant_id, idempotency_key)
);
create unique index publications_provider_external_uq on app.publications (provider, external_id)
  where external_id is not null;
create index publications_status_schedule_idx on app.publications (status, scheduled_at);

create table app.publication_attempts (
  id uuid primary key,
  tenant_id uuid not null references app.tenants(id),
  publication_id uuid not null references app.publications(id),
  attempt smallint not null,
  request_sha256 char(64) not null,
  provider_request_id varchar(255),
  started_at timestamptz not null,
  finished_at timestamptz not null,
  outcome varchar(24) not null,
  http_status smallint,
  error jsonb,
  created_at timestamptz not null default now(),
  unique (publication_id, attempt)
);

create table app.reports (
  id uuid primary key,
  tenant_id uuid not null references app.tenants(id),
  period_start date not null,
  period_end date not null,
  status varchar(24) not null,
  current_version integer not null default 1,
  first_report boolean not null,
  approved_by uuid references app.users(id),
  approved_at timestamptz,
  published_at timestamptz,
  next_review_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  unique (tenant_id, period_start, period_end)
);

create table app.report_snapshots (
  id uuid primary key,
  tenant_id uuid not null references app.tenants(id),
  report_id uuid not null references app.reports(id),
  version integer not null,
  data jsonb not null,
  narrative jsonb not null,
  html_object_key varchar(512) not null,
  pdf_object_key varchar(512),
  sha256 char(64) not null,
  generated_at timestamptz not null,
  ai_run_id uuid references app.ai_runs(id),
  created_at timestamptz not null default now(),
  unique (report_id, version),
  unique (tenant_id, sha256)
);

create table app.report_recipients (
  id uuid primary key,
  tenant_id uuid not null references app.tenants(id),
  report_id uuid not null references app.reports(id),
  email extensions.citext not null,
  name varchar(160),
  kind varchar(20) not null,
  verified_at timestamptz,
  added_by uuid not null references app.users(id),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  unique (report_id, email)
);

create table app.report_deliveries (
  id uuid primary key,
  tenant_id uuid not null references app.tenants(id),
  report_id uuid not null references app.reports(id),
  snapshot_version integer not null,
  recipient_id uuid not null references app.report_recipients(id),
  channel varchar(16) not null default 'email',
  status varchar(24) not null,
  idempotency_key varchar(160) not null,
  provider_message_id varchar(255),
  attempt smallint not null default 0,
  sent_at timestamptz,
  delivered_at timestamptz,
  opened_at timestamptz,
  bounced_at timestamptz,
  error_code varchar(80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  unique (tenant_id, idempotency_key)
);

create table app.report_links (
  id uuid primary key,
  tenant_id uuid not null references app.tenants(id),
  report_id uuid not null references app.reports(id),
  token_hash bytea not null unique,
  recipient_id uuid references app.report_recipients(id),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_accessed_at timestamptz,
  access_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1
);

create table app.notifications (
  id uuid primary key,
  tenant_id uuid not null references app.tenants(id),
  user_id uuid not null references app.users(id),
  type varchar(80) not null,
  priority varchar(16) not null,
  title varchar(200) not null,
  body text not null,
  action_url varchar(512),
  dedupe_key varchar(160) not null,
  read_at timestamptz,
  dismissed_at timestamptz,
  related_type varchar(40),
  related_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  unique (user_id, dedupe_key)
);

create table app.conversion_imports (
  id uuid primary key,
  tenant_id uuid not null references app.tenants(id),
  source_assessment_id varchar(255) not null unique,
  source_version varchar(32) not null,
  idempotency_key varchar(160) not null unique,
  payload_sha256 char(64) not null,
  status varchar(24) not null,
  imported_at timestamptz,
  error jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1
);

create table app.config_versions (
  id uuid primary key,
  tenant_id uuid not null references app.tenants(id),
  namespace varchar(64) not null,
  version integer not null,
  value jsonb not null,
  sha256 char(64) not null,
  effective_at timestamptz not null,
  created_by uuid not null references app.users(id),
  created_at timestamptz not null default now(),
  unique (tenant_id, namespace, version)
);

create table app.product_events (
  id uuid primary key,
  tenant_id uuid references app.tenants(id),
  user_pseudo_id char(64),
  session_id uuid,
  name varchar(100) not null,
  schema_version varchar(16) not null,
  properties jsonb not null,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  source varchar(16) not null,
  request_id varchar(128)
);
create index product_events_name_occurred_idx on app.product_events (name, occurred_at);

create table app.ai_run_evidence (
  ai_run_id uuid not null references app.ai_runs(id),
  evidence_id uuid not null references app.evidence(id),
  position smallint not null,
  purpose varchar(40) not null check (purpose in ('fact', 'context', 'constraint')),
  primary key (ai_run_id, evidence_id),
  unique (ai_run_id, position)
);

create trigger task_activities_append_only
before update or delete on app.task_activities
for each row execute function app.reject_append_only_mutation();
create trigger content_versions_append_only
before update or delete on app.content_versions
for each row execute function app.reject_append_only_mutation();
create trigger publication_attempts_append_only
before update or delete on app.publication_attempts
for each row execute function app.reject_append_only_mutation();
create trigger report_snapshots_append_only
before update or delete on app.report_snapshots
for each row execute function app.reject_append_only_mutation();

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'locations', 'notification_preferences', 'support_grants', 'idempotency_records',
    'integration_connections', 'integration_properties', 'sync_jobs', 'webhook_events',
    'raw_imports', 'metric_snapshots', 'evidence', 'usage_events', 'budgets', 'ai_runs',
    'recommendations', 'tasks', 'task_activities', 'approvals', 'alerts', 'reviews',
    'review_replies', 'brand_kits', 'content_items', 'content_versions', 'assets',
    'publications', 'publication_attempts', 'reports', 'report_snapshots',
    'report_recipients', 'report_deliveries', 'report_links', 'notifications',
    'conversion_imports', 'config_versions', 'product_events'
  ]
  loop
    execute format('alter table app.%I enable row level security', table_name);
    execute format('alter table app.%I force row level security', table_name);
    execute format(
      'create policy %I on app.%I for all to gm_app using (
         tenant_id = app.current_tenant_id() and app.has_tenant_access(tenant_id)
       ) with check (
         tenant_id = app.current_tenant_id() and app.has_tenant_access(tenant_id)
       )',
      table_name || '_tenant_policy',
      table_name
    );
  end loop;
end
$$;

revoke update, delete on app.task_activities, app.content_versions,
  app.publication_attempts, app.report_snapshots from gm_app;

grant select, insert, update, delete on all tables in schema app to gm_app;

commit;

