begin;

-- Reconcile existing evidence/AI associations with the tenant-first invariant.
alter table app.evidence add constraint evidence_tenant_id_uq unique (tenant_id, id);
alter table app.ai_runs add constraint ai_runs_tenant_id_uq unique (tenant_id, id);
alter table app.recommendations add constraint recommendations_tenant_id_uq unique (tenant_id, id);

alter table app.recommendation_evidence add column tenant_id uuid;
update app.recommendation_evidence relation
set tenant_id = recommendation.tenant_id
from app.recommendations recommendation
where recommendation.id = relation.recommendation_id;
alter table app.recommendation_evidence alter column tenant_id set not null;
alter table app.recommendation_evidence
  add constraint recommendation_evidence_tenant_fk
  foreign key (tenant_id) references app.tenants(id),
  add constraint recommendation_evidence_recommendation_tenant_fk
  foreign key (tenant_id, recommendation_id)
  references app.recommendations(tenant_id, id),
  add constraint recommendation_evidence_evidence_tenant_fk
  foreign key (tenant_id, evidence_id)
  references app.evidence(tenant_id, id);
alter table app.recommendation_evidence drop constraint recommendation_evidence_pkey;
alter table app.recommendation_evidence
  add primary key (tenant_id, recommendation_id, evidence_id);
create index recommendation_evidence_tenant_evidence_idx
  on app.recommendation_evidence (tenant_id, evidence_id);

alter table app.ai_run_evidence add column tenant_id uuid;
update app.ai_run_evidence relation
set tenant_id = run.tenant_id
from app.ai_runs run
where run.id = relation.ai_run_id;
alter table app.ai_run_evidence alter column tenant_id set not null;
alter table app.ai_run_evidence
  add constraint ai_run_evidence_tenant_fk
  foreign key (tenant_id) references app.tenants(id),
  add constraint ai_run_evidence_run_tenant_fk
  foreign key (tenant_id, ai_run_id)
  references app.ai_runs(tenant_id, id),
  add constraint ai_run_evidence_evidence_tenant_fk
  foreign key (tenant_id, evidence_id)
  references app.evidence(tenant_id, id);
alter table app.ai_run_evidence drop constraint ai_run_evidence_pkey;
alter table app.ai_run_evidence add primary key (tenant_id, ai_run_id, evidence_id);
create index ai_run_evidence_tenant_evidence_idx
  on app.ai_run_evidence (tenant_id, evidence_id);

drop policy if exists recommendation_evidence_tenant_policy on app.recommendation_evidence;
create policy recommendation_evidence_tenant_policy on app.recommendation_evidence
for all to gm_app using (
  tenant_id = app.current_tenant_id()
  and (app.is_system_actor() or app.has_tenant_access(tenant_id))
) with check (
  tenant_id = app.current_tenant_id()
  and (app.is_system_actor() or app.has_tenant_access(tenant_id))
);

drop policy if exists ai_run_evidence_tenant_policy on app.ai_run_evidence;
create policy ai_run_evidence_tenant_policy on app.ai_run_evidence
for all to gm_app using (
  tenant_id = app.current_tenant_id()
  and (app.is_system_actor() or app.has_tenant_access(tenant_id))
) with check (
  tenant_id = app.current_tenant_id()
  and (app.is_system_actor() or app.has_tenant_access(tenant_id))
);

create table app.provider_price_catalog (
  id uuid primary key default gen_random_uuid(),
  provider varchar(32) not null,
  operation varchar(80) not null,
  unit varchar(40) not null,
  unit_price numeric(20,9) not null check (unit_price >= 0),
  currency char(3) not null default 'USD',
  effective_from timestamptz not null,
  effective_until timestamptz,
  source_url varchar(512) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  unique (provider, operation, unit, effective_from),
  check (effective_until is null or effective_until > effective_from)
);

create table app.seo_source_registry (
  id uuid primary key default gen_random_uuid(),
  code varchar(64) not null unique,
  name varchar(160) not null,
  license varchar(80) not null,
  terms_url varchar(512),
  attribution text,
  allowed_uses text[] not null default '{}',
  retention_policy varchar(160) not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1
);

create table app.cost_reservations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id),
  provider varchar(32) not null,
  operation varchar(80) not null,
  idempotency_key varchar(160) not null,
  status varchar(24) not null default 'reserved'
    check (status in ('reserved', 'reconciled', 'released', 'expired')),
  estimated_cost numeric(14,6) not null check (estimated_cost >= 0),
  actual_cost numeric(14,6) check (actual_cost >= 0),
  currency char(3) not null default 'USD',
  expires_at timestamptz not null,
  reconciled_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  unique (tenant_id, id),
  unique (tenant_id, idempotency_key)
);
create index cost_reservations_tenant_provider_status_idx
  on app.cost_reservations (tenant_id, provider, status);

create table app.seo_targets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id),
  location_id uuid references app.locations(id),
  url varchar(2048) not null,
  normalized_origin varchar(512) not null,
  scope varchar(16) not null default 'origin' check (scope in ('origin', 'path')),
  locale varchar(16) not null default 'pt-BR',
  timezone varchar(64) not null default 'America/Sao_Paulo',
  status varchar(20) not null default 'active' check (status in ('active', 'paused', 'archived')),
  crawl_policy jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  unique (tenant_id, id),
  unique (tenant_id, normalized_origin, scope)
);
create index seo_targets_tenant_status_idx on app.seo_targets (tenant_id, status);

create table app.seo_monitoring_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id),
  target_id uuid not null,
  enabled_capabilities text[] not null,
  cadence jsonb not null,
  critical_urls text[] not null default '{}',
  geogrid jsonb not null,
  monthly_budget numeric(14,4) check (monthly_budget >= 0),
  currency char(3) not null default 'USD',
  next_daily_at timestamptz,
  next_weekly_at timestamptz,
  next_monthly_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  unique (tenant_id, id),
  unique (tenant_id, target_id),
  foreign key (tenant_id, target_id) references app.seo_targets(tenant_id, id)
);
create index seo_monitoring_profiles_tenant_due_idx
  on app.seo_monitoring_profiles (tenant_id, next_daily_at, next_weekly_at, next_monthly_at);

create table app.seo_analysis_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id),
  target_id uuid not null,
  mode varchar(24) not null check (mode in ('baseline', 'periodic', 'on_demand', 'post_deploy')),
  status varchar(24) not null default 'queued'
    check (status in ('queued', 'planning', 'running', 'partial', 'succeeded', 'failed', 'cancelled', 'cost_blocked')),
  planner_version varchar(64) not null,
  config_version varchar(64) not null,
  requested_capabilities text[] not null,
  idempotency_key varchar(160) not null,
  requested_by uuid references app.users(id),
  estimated_cost numeric(14,6) not null default 0 check (estimated_cost >= 0),
  actual_cost numeric(14,6) not null default 0 check (actual_cost >= 0),
  currency char(3) not null default 'USD',
  coverage numeric(5,4) not null default 0 check (coverage between 0 and 1),
  started_at timestamptz,
  finished_at timestamptz,
  report_html_key varchar(512),
  report_pdf_key varchar(512),
  error jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  unique (tenant_id, id),
  unique (tenant_id, idempotency_key),
  foreign key (tenant_id, target_id) references app.seo_targets(tenant_id, id)
);
create index seo_analysis_runs_tenant_target_created_idx
  on app.seo_analysis_runs (tenant_id, target_id, created_at desc);
create index seo_analysis_runs_tenant_status_idx on app.seo_analysis_runs (tenant_id, status);

create table app.seo_capability_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id),
  analysis_run_id uuid not null,
  capability_code varchar(40) not null,
  status varchar(24) not null default 'queued'
    check (status in ('queued', 'running', 'skipped', 'succeeded', 'failed', 'cost_blocked')),
  skip_reason varchar(40),
  rule_version varchar(64) not null,
  input_sha256 char(64),
  output_sha256 char(64),
  attempt smallint not null default 0 check (attempt between 0 and 3),
  estimated_cost numeric(14,6) not null default 0 check (estimated_cost >= 0),
  actual_cost numeric(14,6) not null default 0 check (actual_cost >= 0),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  started_at timestamptz,
  finished_at timestamptz,
  error jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  unique (tenant_id, id),
  unique (tenant_id, analysis_run_id, capability_code),
  foreign key (tenant_id, analysis_run_id) references app.seo_analysis_runs(tenant_id, id),
  check (
    (status = 'skipped' and skip_reason is not null)
    or (status <> 'skipped' and skip_reason is null)
  )
);
create index seo_capability_runs_tenant_status_idx
  on app.seo_capability_runs (tenant_id, status);

create table app.seo_pages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id),
  target_id uuid not null,
  normalized_url varchar(2048) not null,
  discovery_source varchar(40) not null,
  page_type varchar(40),
  critical boolean not null default false,
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  unique (tenant_id, id),
  unique (tenant_id, target_id, normalized_url),
  foreign key (tenant_id, target_id) references app.seo_targets(tenant_id, id)
);
create index seo_pages_tenant_target_seen_idx
  on app.seo_pages (tenant_id, target_id, last_seen_at desc);

create table app.seo_page_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id),
  page_id uuid not null,
  analysis_run_id uuid not null,
  raw_import_id uuid references app.raw_imports(id),
  evidence_id uuid not null,
  observed_at timestamptz not null,
  status_code smallint,
  mime_type varchar(120),
  response_headers jsonb not null default '{}'::jsonb,
  title text,
  description text,
  canonical_url text,
  robots text[] not null default '{}',
  headings jsonb not null default '{}'::jsonb,
  structured_data jsonb not null default '[]'::jsonb,
  language varchar(16),
  word_count integer not null default 0 check (word_count >= 0),
  render_suggested boolean not null default false,
  html_sha256 char(64),
  content_sha256 char(64),
  schema_sha256 char(64),
  render_mode varchar(24) not null default 'http' check (render_mode in ('http', 'external')),
  quality varchar(24) not null default 'complete' check (quality in ('complete', 'partial', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  unique (tenant_id, id),
  unique (tenant_id, page_id, analysis_run_id),
  foreign key (tenant_id, page_id) references app.seo_pages(tenant_id, id),
  foreign key (tenant_id, analysis_run_id) references app.seo_analysis_runs(tenant_id, id),
  foreign key (tenant_id, evidence_id) references app.evidence(tenant_id, id)
);
create index seo_page_snapshots_tenant_page_observed_idx
  on app.seo_page_snapshots (tenant_id, page_id, observed_at desc);

create table app.seo_findings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id),
  target_id uuid not null,
  analysis_run_id uuid not null,
  capability_run_id uuid,
  page_id uuid,
  code varchar(96) not null check (code ~ '^SEO-[A-Z0-9]+(-[A-Z0-9]+)+$'),
  category varchar(32) not null,
  severity varchar(16) not null check (severity in ('critical', 'high', 'medium', 'low', 'info')),
  title varchar(200) not null,
  description text not null,
  confidence numeric(5,4) not null check (confidence between 0 and 1),
  confidence_coverage numeric(5,4) not null check (confidence_coverage between 0 and 1),
  confidence_freshness numeric(5,4) not null check (confidence_freshness between 0 and 1),
  confidence_agreement numeric(5,4) not null check (confidence_agreement between 0 and 1),
  origin jsonb not null,
  recommendation text not null,
  impact jsonb not null,
  status varchar(32) not null default 'open',
  dedupe_key varchar(160) not null,
  rule_version varchar(64) not null,
  ai_run_id uuid,
  recommendation_id uuid,
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  consecutive_clean_runs smallint not null default 0 check (consecutive_clean_runs >= 0),
  dismissed_reason varchar(1000),
  dismissed_until timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  unique (tenant_id, id),
  unique (tenant_id, dedupe_key),
  foreign key (tenant_id, target_id) references app.seo_targets(tenant_id, id),
  foreign key (tenant_id, analysis_run_id) references app.seo_analysis_runs(tenant_id, id),
  foreign key (tenant_id, capability_run_id) references app.seo_capability_runs(tenant_id, id),
  foreign key (tenant_id, page_id) references app.seo_pages(tenant_id, id),
  foreign key (tenant_id, ai_run_id) references app.ai_runs(tenant_id, id),
  foreign key (tenant_id, recommendation_id) references app.recommendations(tenant_id, id),
  check (
    (status = 'dismissed' and dismissed_reason is not null)
    or status <> 'dismissed'
  )
);
create index seo_findings_tenant_target_status_idx
  on app.seo_findings (tenant_id, target_id, status);
create index seo_findings_tenant_severity_seen_idx
  on app.seo_findings (tenant_id, severity, last_seen_at desc);

create table app.seo_finding_evidence (
  tenant_id uuid not null references app.tenants(id),
  finding_id uuid not null,
  evidence_id uuid not null,
  position smallint not null,
  claim varchar(500) not null,
  role varchar(24) not null default 'fact' check (role in ('fact', 'context', 'constraint')),
  primary key (tenant_id, finding_id, evidence_id),
  unique (tenant_id, finding_id, position),
  foreign key (tenant_id, finding_id) references app.seo_findings(tenant_id, id),
  foreign key (tenant_id, evidence_id) references app.evidence(tenant_id, id)
);
create index seo_finding_evidence_tenant_evidence_idx
  on app.seo_finding_evidence (tenant_id, evidence_id);

create table app.seo_baselines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id),
  target_id uuid not null,
  analysis_run_id uuid not null,
  status varchar(24) not null check (status in ('provisional', 'active', 'superseded')),
  coverage numeric(5,4) not null check (coverage between 0 and 1),
  rule_version varchar(64) not null,
  config_version varchar(64) not null,
  established_at timestamptz not null,
  superseded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  unique (tenant_id, id),
  foreign key (tenant_id, target_id) references app.seo_targets(tenant_id, id),
  foreign key (tenant_id, analysis_run_id) references app.seo_analysis_runs(tenant_id, id)
);
create unique index seo_baselines_tenant_target_active_uq
  on app.seo_baselines (tenant_id, target_id)
  where status in ('provisional', 'active');
create index seo_baselines_tenant_target_status_idx
  on app.seo_baselines (tenant_id, target_id, status);

create table app.seo_comparisons (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id),
  target_id uuid not null,
  baseline_id uuid not null,
  current_run_id uuid not null,
  status varchar(24) not null check (status in ('complete', 'partial', 'incomparable')),
  summary jsonb not null,
  comparable_coverage numeric(5,4) not null check (comparable_coverage between 0 and 1),
  compared_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  unique (tenant_id, id),
  unique (tenant_id, baseline_id, current_run_id),
  foreign key (tenant_id, target_id) references app.seo_targets(tenant_id, id),
  foreign key (tenant_id, baseline_id) references app.seo_baselines(tenant_id, id),
  foreign key (tenant_id, current_run_id) references app.seo_analysis_runs(tenant_id, id)
);
create index seo_comparisons_tenant_target_compared_idx
  on app.seo_comparisons (tenant_id, target_id, compared_at desc);

create table app.seo_keywords (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id),
  target_id uuid not null,
  location_id uuid references app.locations(id),
  keyword varchar(255) not null,
  intent varchar(32),
  locale varchar(16) not null,
  device varchar(16) not null default 'desktop' check (device in ('desktop', 'mobile')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  unique (tenant_id, id),
  unique (tenant_id, target_id, keyword, locale, device),
  foreign key (tenant_id, target_id) references app.seo_targets(tenant_id, id)
);
create index seo_keywords_tenant_target_active_idx
  on app.seo_keywords (tenant_id, target_id, active);

create table app.seo_competitors (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id),
  target_id uuid not null,
  name varchar(160) not null,
  domain varchar(255),
  place_id varchar(255),
  source varchar(40) not null,
  confirmed boolean not null default false,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  unique (tenant_id, id),
  foreign key (tenant_id, target_id) references app.seo_targets(tenant_id, id)
);
create index seo_competitors_tenant_target_active_idx
  on app.seo_competitors (tenant_id, target_id, active);

create table app.seo_geogrid_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id),
  target_id uuid not null,
  analysis_run_id uuid not null,
  keyword_id uuid not null,
  provider varchar(32) not null,
  grid_size smallint not null check (grid_size between 3 and 15 and grid_size % 2 = 1),
  radius_meters integer not null check (radius_meters between 100 and 100000),
  center_latitude numeric(10,7) not null check (center_latitude between -90 and 90),
  center_longitude numeric(10,7) not null check (center_longitude between -180 and 180),
  estimated_cost numeric(14,6) not null default 0 check (estimated_cost >= 0),
  actual_cost numeric(14,6) not null default 0 check (actual_cost >= 0),
  status varchar(24) not null,
  observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  unique (tenant_id, id),
  foreign key (tenant_id, target_id) references app.seo_targets(tenant_id, id),
  foreign key (tenant_id, analysis_run_id) references app.seo_analysis_runs(tenant_id, id),
  foreign key (tenant_id, keyword_id) references app.seo_keywords(tenant_id, id)
);
create index seo_geogrid_runs_tenant_target_observed_idx
  on app.seo_geogrid_runs (tenant_id, target_id, observed_at desc);

create table app.seo_geogrid_points (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id),
  geogrid_run_id uuid not null,
  evidence_id uuid not null,
  row smallint not null,
  column smallint not null,
  latitude numeric(10,7) not null check (latitude between -90 and 90),
  longitude numeric(10,7) not null check (longitude between -180 and 180),
  position smallint check (position is null or position > 0),
  observed boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  unique (tenant_id, geogrid_run_id, row, column),
  foreign key (tenant_id, geogrid_run_id) references app.seo_geogrid_runs(tenant_id, id),
  foreign key (tenant_id, evidence_id) references app.evidence(tenant_id, id)
);
create index seo_geogrid_points_tenant_evidence_idx
  on app.seo_geogrid_points (tenant_id, evidence_id);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'cost_reservations', 'seo_targets', 'seo_monitoring_profiles', 'seo_analysis_runs',
    'seo_capability_runs', 'seo_pages', 'seo_page_snapshots', 'seo_findings',
    'seo_finding_evidence', 'seo_baselines', 'seo_comparisons', 'seo_keywords',
    'seo_competitors', 'seo_geogrid_runs', 'seo_geogrid_points'
  ]
  loop
    execute format('alter table app.%I enable row level security', table_name);
    execute format('alter table app.%I force row level security', table_name);
    execute format(
      'create policy %I on app.%I for all to gm_app using (
         tenant_id = app.current_tenant_id()
         and (app.is_system_actor() or app.has_tenant_access(tenant_id))
       ) with check (
         tenant_id = app.current_tenant_id()
         and (app.is_system_actor() or app.has_tenant_access(tenant_id))
       )',
      table_name || '_tenant_policy',
      table_name
    );
  end loop;
end
$$;

alter table app.provider_price_catalog enable row level security;
alter table app.provider_price_catalog force row level security;
create policy provider_price_catalog_read on app.provider_price_catalog
for select to gm_app using (true);
create policy provider_price_catalog_system_write on app.provider_price_catalog
for all to gm_app using (app.is_system_actor()) with check (app.is_system_actor());

alter table app.seo_source_registry enable row level security;
alter table app.seo_source_registry force row level security;
create policy seo_source_registry_read on app.seo_source_registry
for select to gm_app using (true);
create policy seo_source_registry_system_write on app.seo_source_registry
for all to gm_app using (app.is_system_actor()) with check (app.is_system_actor());

create trigger seo_page_snapshots_append_only
before update or delete on app.seo_page_snapshots
for each row execute function app.reject_append_only_mutation();

grant select, insert, update, delete on
  app.provider_price_catalog, app.seo_source_registry, app.cost_reservations,
  app.seo_targets, app.seo_monitoring_profiles, app.seo_analysis_runs,
  app.seo_capability_runs, app.seo_pages, app.seo_page_snapshots, app.seo_findings,
  app.seo_finding_evidence, app.seo_baselines, app.seo_comparisons,
  app.seo_keywords, app.seo_competitors, app.seo_geogrid_runs,
  app.seo_geogrid_points
to gm_app;

revoke update, delete on app.seo_page_snapshots from gm_app;

commit;
