begin;

create extension if not exists citext with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists postgis with schema extensions;
create extension if not exists pgmq;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

create schema if not exists app;
revoke all on schema app from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'gm_app') then
    create role gm_app nologin noinherit nobypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'gm_api') then
    create role gm_api login password 'local-only' noinherit nobypassrls;
  end if;
  grant gm_app to gm_api;
end
$$;

grant usage on schema app to gm_app;
alter role gm_api set statement_timeout = '15s';
alter role gm_api set lock_timeout = '5s';
alter role gm_api set search_path = app, extensions, public;

create function app.current_tenant_id()
returns uuid
language sql
stable
parallel safe
as $$
  select nullif(current_setting('app.tenant_id', true), '')::uuid
$$;

create function app.current_auth_user_id()
returns uuid
language sql
stable
parallel safe
as $$
  select nullif(current_setting('app.auth_user_id', true), '')::uuid
$$;

create table app.organizations (
  id uuid primary key,
  name varchar(160) not null,
  slug varchar(80) not null unique check (slug ~ '^[a-z0-9-]+$'),
  status varchar(20) not null default 'active'
    check (status in ('active', 'suspended', 'closing', 'closed')),
  billing_email extensions.citext not null,
  timezone varchar(64) not null default 'America/Sao_Paulo',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0)
);

create table app.tenants (
  id uuid primary key,
  organization_id uuid not null references app.organizations(id),
  name varchar(160) not null,
  legal_name varchar(200),
  slug varchar(80) not null check (slug ~ '^[a-z0-9-]+$'),
  status varchar(20) not null default 'onboarding'
    check (status in ('onboarding', 'active', 'suspended', 'closing', 'closed')),
  industry varchar(80),
  country_code char(2) not null default 'BR',
  timezone varchar(64) not null,
  locale varchar(16) not null default 'pt-BR',
  onboarding_step smallint not null default 0 check (onboarding_step between 0 and 8),
  deletion_due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0),
  unique (organization_id, slug)
);
create index tenants_organization_status_idx on app.tenants (organization_id, status);
create index tenants_deletion_due_idx on app.tenants (deletion_due_at) where deletion_due_at is not null;

create table app.users (
  id uuid primary key,
  auth_user_id uuid not null unique references auth.users(id) on delete restrict,
  email extensions.citext not null unique,
  name varchar(160) not null,
  status varchar(20) not null default 'invited'
    check (status in ('invited', 'active', 'suspended', 'anonymized')),
  email_verified_at timestamptz,
  last_login_at timestamptz,
  locale varchar(16) not null default 'pt-BR',
  mfa_state varchar(20) not null default 'optional',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0)
);
create index users_status_idx on app.users (status);

create function app.current_app_user_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id
  from app.users u
  where u.auth_user_id = app.current_auth_user_id()
    and u.status = 'active'
  limit 1
$$;

create table app.memberships (
  id uuid primary key,
  organization_id uuid not null references app.organizations(id),
  tenant_id uuid references app.tenants(id),
  user_id uuid not null references app.users(id),
  role varchar(40) not null check (role in (
    'platform_admin', 'agency_owner', 'agency_manager', 'strategist',
    'content_editor', 'analyst', 'client_admin', 'client_approver',
    'client_viewer', 'support'
  )),
  status varchar(20) not null default 'active'
    check (status in ('active', 'suspended', 'revoked')),
  granted_by uuid references app.users(id),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0),
  unique nulls not distinct (organization_id, tenant_id, user_id, role)
);
create index memberships_user_status_idx on app.memberships (user_id, status);
create index memberships_tenant_status_idx on app.memberships (tenant_id, status);

create function app.has_tenant_access(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from app.memberships m
    join app.users u on u.id = m.user_id
    join app.tenants t on t.id = target_tenant_id
    join app.organizations o on o.id = t.organization_id
    where u.auth_user_id = app.current_auth_user_id()
      and u.status = 'active'
      and m.status = 'active'
      and (m.expires_at is null or m.expires_at > now())
      and o.status = 'active'
      and t.status not in ('suspended', 'closed')
      and (
        m.tenant_id = target_tenant_id
        or (m.tenant_id is null and m.organization_id = t.organization_id)
      )
  )
$$;

revoke all on function app.current_app_user_id() from public;
revoke all on function app.has_tenant_access(uuid) from public;
grant execute on function app.current_app_user_id() to gm_app;
grant execute on function app.has_tenant_access(uuid) to gm_app;

create table app.locations (
  id uuid primary key,
  tenant_id uuid not null references app.tenants(id),
  name varchar(160) not null,
  external_key varchar(255),
  address jsonb,
  geo extensions.geography(point, 4326),
  service_area jsonb,
  primary_location boolean not null default false,
  status varchar(20) not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0)
);
create unique index locations_primary_uq on app.locations (tenant_id) where primary_location;
create index locations_tenant_status_idx on app.locations (tenant_id, status);
create index locations_geo_idx on app.locations using gist (geo);

create table app.invitations (
  id uuid primary key,
  organization_id uuid not null references app.organizations(id),
  tenant_id uuid references app.tenants(id),
  email extensions.citext not null,
  role varchar(40) not null,
  token_hash bytea not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  invited_by uuid not null references app.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1
);
create index invitations_email_expires_idx on app.invitations (email, expires_at);

create table app.support_grants (
  id uuid primary key,
  tenant_id uuid not null references app.tenants(id),
  support_user_id uuid not null references app.users(id),
  approved_by uuid not null references app.users(id),
  reason varchar(500) not null,
  scope text[] not null,
  starts_at timestamptz not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  check (expires_at <= starts_at + interval '4 hours')
);
create index support_grants_tenant_expires_idx on app.support_grants (tenant_id, expires_at);

create table app.notification_preferences (
  id uuid primary key,
  tenant_id uuid not null references app.tenants(id),
  user_id uuid not null references app.users(id),
  event_type varchar(80) not null,
  in_app boolean not null default true,
  email boolean not null default true,
  quiet_hours jsonb not null default '{}'::jsonb,
  digest varchar(20) not null default 'instant',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  unique (tenant_id, user_id, event_type)
);

create table app.feature_flags (
  key varchar(120) not null,
  environment varchar(20) not null,
  enabled boolean not null default false,
  rules jsonb not null default '{}'::jsonb,
  owner varchar(120) not null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  primary key (key, environment)
);

create table app.idempotency_records (
  id uuid primary key,
  tenant_id uuid not null references app.tenants(id),
  key varchar(160) not null,
  request_sha256 char(64) not null,
  status varchar(20) not null,
  response_status smallint,
  response jsonb,
  locked_until timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  unique (tenant_id, key)
);

create table app.outbox_events (
  id uuid primary key,
  tenant_id uuid references app.tenants(id),
  aggregate_type varchar(80) not null,
  aggregate_id uuid not null,
  event_type varchar(100) not null,
  schema_version varchar(16) not null,
  idempotency_key varchar(160) not null unique,
  payload jsonb not null,
  trace_id varchar(128) not null,
  occurred_at timestamptz not null default now(),
  published_at timestamptz
);
create index outbox_unpublished_idx on app.outbox_events (published_at, occurred_at);

create table app.inbox_messages (
  id uuid primary key,
  tenant_id uuid references app.tenants(id),
  consumer varchar(100) not null,
  message_id varchar(160) not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  result jsonb,
  unique (consumer, message_id)
);

create table app.dead_letters (
  id uuid primary key,
  tenant_id uuid references app.tenants(id),
  queue varchar(80) not null,
  message_id varchar(160) not null,
  job_type varchar(80) not null,
  payload jsonb not null,
  error jsonb not null,
  attempts smallint not null,
  failed_at timestamptz not null default now(),
  redriven_at timestamptz
);
create index dead_letters_queue_failed_idx on app.dead_letters (queue, failed_at);

create table app.audit_logs (
  id uuid primary key,
  organization_id uuid references app.organizations(id),
  tenant_id uuid references app.tenants(id),
  actor_type varchar(24) not null,
  actor_id varchar(128),
  action varchar(100) not null,
  resource_type varchar(80) not null,
  resource_id varchar(128),
  request_id varchar(128) not null,
  trace_id varchar(128) not null,
  ip_hash char(64),
  user_agent_hash char(64),
  before_hash char(64),
  after_hash char(64),
  previous_hash char(64),
  hash char(64) not null unique,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
create index audit_tenant_occurred_idx on app.audit_logs (tenant_id, occurred_at desc);
create index audit_actor_occurred_idx on app.audit_logs (actor_id, occurred_at desc);
create index audit_request_idx on app.audit_logs (request_id);

create function app.reject_append_only_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'append-only table cannot be updated or deleted'
    using errcode = '55000';
end
$$;

create trigger audit_logs_append_only
before update or delete on app.audit_logs
for each row execute function app.reject_append_only_mutation();

alter table app.organizations enable row level security;
alter table app.organizations force row level security;
alter table app.tenants enable row level security;
alter table app.tenants force row level security;
alter table app.users enable row level security;
alter table app.users force row level security;
alter table app.memberships enable row level security;
alter table app.memberships force row level security;

create policy organizations_member_select on app.organizations
for select to gm_app using (
  exists (
    select 1 from app.memberships m
    where m.organization_id = organizations.id
      and m.user_id = app.current_app_user_id()
      and m.status = 'active'
  )
);
create policy tenants_member_select on app.tenants
for select to gm_app using (app.has_tenant_access(id));
create policy users_self_select on app.users
for select to gm_app using (auth_user_id = app.current_auth_user_id());
create policy memberships_self_select on app.memberships
for select to gm_app using (
  user_id = app.current_app_user_id()
  and (tenant_id is null or app.has_tenant_access(tenant_id))
);

grant select on app.organizations, app.tenants, app.users, app.memberships to gm_app;
grant select, insert, update, delete on all tables in schema app to gm_app;
revoke update, delete on app.audit_logs from gm_app;
alter default privileges in schema app grant select, insert, update, delete on tables to gm_app;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('assets', 'assets', false, 20971520, array['image/png','image/jpeg','image/webp','application/pdf']),
  ('raw', 'raw', false, 52428800, array['application/json','application/gzip']),
  ('reports', 'reports', false, 52428800, array['text/html','application/pdf']),
  ('exports', 'exports', false, 1073741824, array['application/zip','application/json']),
  ('audit', 'audit', false, 52428800, array['application/json','application/gzip'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

select pgmq.create('general') where not exists (
  select 1 from pg_tables where schemaname = 'pgmq' and tablename = 'q_general'
);
select pgmq.create('publication') where not exists (
  select 1 from pg_tables where schemaname = 'pgmq' and tablename = 'q_publication'
);
select pgmq.create('delivery') where not exists (
  select 1 from pg_tables where schemaname = 'pgmq' and tablename = 'q_delivery'
);
select pgmq.create('render') where not exists (
  select 1 from pg_tables where schemaname = 'pgmq' and tablename = 'q_render'
);

commit;
