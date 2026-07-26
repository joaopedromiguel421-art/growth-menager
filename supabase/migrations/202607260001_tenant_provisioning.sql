begin;

-- Onboarding a client had no path through the application: app.organizations,
-- app.tenants, app.users and app.memberships force row level security and only
-- carry SELECT policies, so every row so far was inserted by hand. Granting
-- INSERT policies directly cannot work for the first membership — the check
-- would have to read the very row it is creating — so provisioning goes through
-- security definer functions, the same door app.enqueue_due_jobs already uses.

-- ---------------------------------------------------------------------------
-- Access helpers
-- ---------------------------------------------------------------------------

-- A policy on app.memberships that subqueries app.memberships recurses forever.
-- Running as definer breaks the cycle, exactly as app.current_app_user_id() does
-- for the existing memberships_self_select policy.
create function app.is_org_admin(p_organization_id uuid)
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
    join app.organizations o on o.id = m.organization_id
    where m.organization_id = p_organization_id
      and u.auth_user_id = app.current_auth_user_id()
      and u.status = 'active'
      and m.status = 'active'
      and (m.expires_at is null or m.expires_at > now())
      and o.status = 'active'
      and m.role in ('platform_admin', 'agency_owner', 'agency_manager', 'client_admin')
  )
$$;

-- Lets the team screen resolve a colleague's name and email without exposing
-- app.users to anyone outside the shared organization.
create function app.shares_organization(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from app.memberships mine
    join app.users me on me.id = mine.user_id
    join app.memberships theirs on theirs.organization_id = mine.organization_id
    where me.auth_user_id = app.current_auth_user_id()
      and me.status = 'active'
      and mine.status = 'active'
      and theirs.user_id = p_user_id
      and theirs.status = 'active'
  )
$$;

revoke all on function app.is_org_admin(uuid) from public, anon, authenticated;
revoke all on function app.shares_organization(uuid) from public, anon, authenticated;
grant execute on function app.is_org_admin(uuid) to gm_app;
grant execute on function app.shares_organization(uuid) to gm_app;

-- ---------------------------------------------------------------------------
-- Policies that do not need a definer
-- ---------------------------------------------------------------------------

-- Advancing onboarding_step and flipping status to 'active' happen through the
-- API under the caller's own session, so an UPDATE policy is enough.
create policy tenants_member_update on app.tenants
for update to gm_app
using (app.has_tenant_access(id))
with check (app.has_tenant_access(id));

-- Reading colleagues and granting or revoking their access is an org-admin act.
create policy memberships_org_admin_policy on app.memberships
for all to gm_app
using (app.is_org_admin(organization_id))
with check (app.is_org_admin(organization_id));

create policy users_org_visible_select on app.users
for select to gm_app
using (auth_user_id = app.current_auth_user_id() or app.shares_organization(id));

-- invitations_scope_policy already lets any active org member read and write,
-- but its check demanded a tenant_id, which made an organization-wide invite
-- impossible to insert. Org admins may now issue one.
drop policy if exists invitations_scope_policy on app.invitations;
create policy invitations_scope_policy on app.invitations
for all to gm_app
using (
  app.is_system_actor()
  or (tenant_id is not null and app.has_tenant_access(tenant_id))
  or exists (
    select 1 from app.memberships m
    where m.organization_id = invitations.organization_id
      and m.user_id = app.current_app_user_id()
      and m.status = 'active'
  )
)
with check (
  app.is_system_actor()
  or (tenant_id is not null and app.has_tenant_access(tenant_id))
  or app.is_org_admin(organization_id)
);

-- ---------------------------------------------------------------------------
-- Tenant provisioning
-- ---------------------------------------------------------------------------

create function app.unique_organization_slug(p_seed text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_candidate text;
  v_attempt integer := 1;
begin
  loop
    v_candidate := case
      when v_attempt = 1 then p_seed
      else left(p_seed, 76) || '-' || v_attempt::text
    end;
    exit when not exists (select 1 from app.organizations where slug = v_candidate);
    v_attempt := v_attempt + 1;
    if v_attempt > 20 then
      raise exception 'GM-ORGANIZATION-SLUG-CONFLICT' using errcode = 'unique_violation';
    end if;
  end loop;
  return v_candidate;
end
$$;

create function app.create_tenant(
  p_organization_id uuid,
  p_organization_name text,
  p_organization_slug text,
  p_billing_email text,
  p_name text,
  p_legal_name text,
  p_slug text,
  p_industry text,
  p_country_code text,
  p_timezone text,
  p_locale text
)
returns table (
  id uuid,
  organization_id uuid,
  organization_name text,
  name text,
  legal_name text,
  slug text,
  status text,
  industry text,
  country_code text,
  timezone text,
  locale text,
  onboarding_step smallint,
  created_at timestamptz,
  version integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_organization_id uuid;
  v_candidate text;
  v_tenant app.tenants;
  v_attempt integer := 1;
begin
  v_actor := app.current_app_user_id();
  if v_actor is null then
    raise exception 'GM-AUTHZ-NO-ACCOUNT'
      using errcode = 'insufficient_privilege';
  end if;

  if p_name is null or btrim(p_name) = '' then
    raise exception 'GM-TENANT-NAME-REQUIRED' using errcode = 'check_violation';
  end if;

  if p_organization_id is null then
    -- Signup is closed, so creating a brand new agency is deliberately limited
    -- to someone who already owns one. The first organization is bootstrapped
    -- out of band.
    if not exists (
      select 1
      from app.memberships m
      where m.user_id = v_actor
        and m.status = 'active'
        and m.tenant_id is null
        and m.role in ('platform_admin', 'agency_owner')
    ) then
      raise exception 'GM-AUTHZ-DENIED' using errcode = 'insufficient_privilege';
    end if;

    if p_organization_name is null or btrim(p_organization_name) = ''
       or p_billing_email is null or btrim(p_billing_email) = '' then
      raise exception 'GM-ORGANIZATION-DETAILS-REQUIRED' using errcode = 'check_violation';
    end if;

    v_organization_id := extensions.gen_random_uuid();
    insert into app.organizations (id, name, slug, billing_email, timezone)
    values (
      v_organization_id,
      btrim(p_organization_name),
      app.unique_organization_slug(
        coalesce(nullif(btrim(coalesce(p_organization_slug, '')), ''), 'organizacao')
      ),
      p_billing_email,
      coalesce(nullif(btrim(p_timezone), ''), 'America/Sao_Paulo')
    );

    insert into app.memberships (id, organization_id, tenant_id, user_id, role, granted_by)
    values (extensions.gen_random_uuid(), v_organization_id, null, v_actor, 'agency_owner', v_actor);
  else
    if not app.is_org_admin(p_organization_id) then
      raise exception 'GM-AUTHZ-DENIED' using errcode = 'insufficient_privilege';
    end if;
    v_organization_id := p_organization_id;
  end if;

  -- Slug collisions are ordinary (two clients called "Padaria"), so suffix and
  -- retry rather than making the operator invent a unique name.
  loop
    v_candidate := case
      when v_attempt = 1 then p_slug
      else left(p_slug, 76) || '-' || v_attempt::text
    end;

    begin
      insert into app.tenants (
        id, organization_id, name, legal_name, slug, status,
        industry, country_code, timezone, locale, onboarding_step
      )
      values (
        extensions.gen_random_uuid(),
        v_organization_id,
        btrim(p_name),
        nullif(btrim(coalesce(p_legal_name, '')), ''),
        v_candidate,
        'onboarding',
        nullif(btrim(coalesce(p_industry, '')), ''),
        coalesce(nullif(btrim(coalesce(p_country_code, '')), ''), 'BR'),
        coalesce(nullif(btrim(coalesce(p_timezone, '')), ''), 'America/Sao_Paulo'),
        coalesce(nullif(btrim(coalesce(p_locale, '')), ''), 'pt-BR')
      )
      returning * into v_tenant;
      exit;
    exception when unique_violation then
      v_attempt := v_attempt + 1;
      if v_attempt > 20 then
        raise exception 'GM-TENANT-SLUG-CONFLICT' using errcode = 'unique_violation';
      end if;
    end;
  end loop;

  -- No tenant-scoped membership is created: the organization-level membership
  -- already satisfies app.has_tenant_access, and a second row would only be a
  -- duplicate to keep in sync.

  -- Every client needs at least one unit before locations can be connected.
  insert into app.locations (id, tenant_id, name, primary_location)
  values (extensions.gen_random_uuid(), v_tenant.id, btrim(p_name), true);

  return query
  select v_tenant.id,
         v_tenant.organization_id,
         o.name::text,
         v_tenant.name::text,
         v_tenant.legal_name::text,
         v_tenant.slug::text,
         v_tenant.status::text,
         v_tenant.industry::text,
         v_tenant.country_code::text,
         v_tenant.timezone::text,
         v_tenant.locale::text,
         v_tenant.onboarding_step,
         v_tenant.created_at,
         v_tenant.version
  from app.organizations o
  where o.id = v_tenant.organization_id;
end
$$;

revoke all on function
  app.create_tenant(uuid, text, text, text, text, text, text, text, text, text, text)
  from public, anon, authenticated;
revoke all on function app.unique_organization_slug(text) from public, anon, authenticated;
grant execute on function
  app.create_tenant(uuid, text, text, text, text, text, text, text, text, text, text)
  to gm_app;

-- ---------------------------------------------------------------------------
-- Invitation acceptance
-- ---------------------------------------------------------------------------

create function app.accept_invitation(
  p_token_hash bytea,
  p_auth_user_id uuid,
  p_email text,
  p_name text
)
returns table (
  organization_id uuid,
  tenant_id uuid,
  role text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invitation app.invitations;
  v_user_id uuid;
begin
  select * into v_invitation
  from app.invitations i
  where i.token_hash = p_token_hash
    and i.accepted_at is null
    and i.revoked_at is null
    and i.expires_at > now()
  for update;

  if not found then
    raise exception 'GM-INVITATION-INVALID' using errcode = 'no_data_found';
  end if;

  -- The token proves possession of the email's inbox only if the signed-in
  -- identity matches the address the invite was issued to.
  if lower(v_invitation.email::text) <> lower(btrim(p_email)) then
    raise exception 'GM-INVITATION-EMAIL-MISMATCH' using errcode = 'insufficient_privilege';
  end if;

  -- status must be 'active': the column defaults to 'invited', and
  -- app.has_tenant_access requires an active user, so leaving the default would
  -- lock the invitee out of every screen with GM-AUTHZ-NO-ACCOUNT.
  insert into app.users (id, auth_user_id, email, name, status, email_verified_at)
  values (
    extensions.gen_random_uuid(),
    p_auth_user_id,
    btrim(p_email),
    coalesce(nullif(btrim(coalesce(p_name, '')), ''), split_part(btrim(p_email), '@', 1)),
    'active',
    now()
  )
  on conflict (auth_user_id) do update
  set status = 'active',
      email_verified_at = coalesce(app.users.email_verified_at, now()),
      updated_at = now(),
      version = app.users.version + 1
  returning id into v_user_id;

  insert into app.memberships (id, organization_id, tenant_id, user_id, role, granted_by)
  values (
    extensions.gen_random_uuid(),
    v_invitation.organization_id,
    v_invitation.tenant_id,
    v_user_id,
    v_invitation.role,
    v_invitation.invited_by
  )
  on conflict do nothing;

  update app.invitations
  set accepted_at = now(),
      updated_at = now(),
      version = version + 1
  where id = v_invitation.id;

  return query
  select v_invitation.organization_id, v_invitation.tenant_id, v_invitation.role::text;
end
$$;

revoke all on function app.accept_invitation(bytea, uuid, text, text)
  from public, anon, authenticated;
grant execute on function app.accept_invitation(bytea, uuid, text, text) to gm_app;

-- ---------------------------------------------------------------------------
-- Recommendation deduplication
-- ---------------------------------------------------------------------------

-- Without a dedupe key every sync would append the same finding again. The
-- partial index lets a dismissed recommendation reappear if the condition
-- returns, while an open one is updated in place.
alter table app.recommendations
  add column dedupe_key varchar(160),
  add column formula_version varchar(20) not null default 'priority-v1';

create unique index recommendations_open_dedupe_uq
  on app.recommendations (tenant_id, dedupe_key)
  where status = 'open' and dedupe_key is not null;

-- ---------------------------------------------------------------------------
-- Recurring synchronisation
-- ---------------------------------------------------------------------------

-- app.enqueue_due_jobs only scans publications, so nothing ever refreshed a
-- connection on its own: data appeared only when someone pressed "sync now".
create function app.enqueue_due_syncs()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  enqueued integer := 0;
begin
  with due as (
    select c.id, c.tenant_id, c.provider
    from app.integration_connections c
    where c.status = 'active'
      and (c.last_synced_at is null or c.last_synced_at < now() - interval '12 hours')
    for update skip locked
  ), inserted as (
    insert into app.outbox_events (
      id, tenant_id, aggregate_type, aggregate_id, event_type, schema_version,
      idempotency_key, payload, trace_id
    )
    select
      extensions.gen_random_uuid(), due.tenant_id, 'integration_connection', due.id,
      'sync_requested', '1',
      -- Bucketing by hour makes a repeated scan idempotent for free.
      'autosync:' || due.id::text || ':' || to_char(now(), 'YYYYMMDDHH24'),
      jsonb_build_object('provider', due.provider, 'connection_id', due.id),
      extensions.gen_random_uuid()::text
    from due
    on conflict (idempotency_key) do nothing
    returning 1
  )
  select count(*) into enqueued from inserted;

  return enqueued;
end
$$;

revoke all on function app.enqueue_due_syncs() from public, anon, authenticated;

select cron.schedule(
  'growth-manager-due-syncs',
  '17 * * * *',
  $$select app.enqueue_due_syncs()$$
)
where not exists (
  select 1 from cron.job where jobname = 'growth-manager-due-syncs'
);

-- ---------------------------------------------------------------------------
-- Outbox relay: stop turning every domain event into a provider sync
-- ---------------------------------------------------------------------------

-- The previous mapping fell through to 'sync' for anything unrecognised, so
-- task_created and recommendation_decided reached the worker as sync jobs with
-- no provider in the payload, failed all five attempts and dead-lettered.
create or replace function app.relay_outbox(batch_size integer default 20)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_record record;
  queue_name text;
  job_type text;
  relayed integer := 0;
begin
  if batch_size not between 1 and 100 then
    raise exception 'Invalid relay batch size'
      using errcode = '22023';
  end if;

  for event_record in
    select event.*
    from app.outbox_events event
    where event.published_at is null
    order by event.occurred_at
    for update skip locked
    limit batch_size
  loop
    queue_name := case
      when event_record.event_type like '%publication%' then 'publication'
      when event_record.event_type like '%delivery%' then 'delivery'
      when event_record.event_type like '%report%' then 'render'
      else 'general'
    end;
    job_type := case
      when event_record.event_type = 'publication_due' then 'publish_content'
      when event_record.event_type like '%delivery%' then 'deliver_report'
      when event_record.event_type like '%report%' then 'render_report'
      when event_record.event_type like 'sync%' then 'sync'
      when event_record.payload ? 'provider' then 'sync'
      else 'notify'
    end;

    perform pgmq.send(
      queue_name,
      jsonb_build_object(
        'id', event_record.id,
        'schema_version', '1',
        'job_type', job_type,
        'tenant_id', event_record.tenant_id,
        'idempotency_key', event_record.idempotency_key,
        'trace_id', event_record.trace_id,
        'attempt', 0,
        'enqueued_at', event_record.occurred_at,
        'cursor', null,
        'payload', event_record.payload
      )
    );

    update app.outbox_events
    set published_at = now()
    where id = event_record.id;
    relayed := relayed + 1;
  end loop;

  return relayed;
end
$$;

revoke all on function app.relay_outbox(integer) from public, anon, authenticated;
grant execute on function app.relay_outbox(integer) to gm_app;

commit;
