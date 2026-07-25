begin;

create function app.is_system_actor()
returns boolean
language sql
stable
parallel safe
as $$
  select coalesce(nullif(current_setting('app.system_actor', true), '')::boolean, false)
$$;

grant execute on function app.is_system_actor() to gm_app;

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
    execute format('drop policy if exists %I on app.%I', table_name || '_tenant_policy', table_name);
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

alter table app.invitations enable row level security;
alter table app.invitations force row level security;
create policy invitations_scope_policy on app.invitations
for all to gm_app using (
  app.is_system_actor()
  or (tenant_id is not null and app.has_tenant_access(tenant_id))
  or exists (
    select 1 from app.memberships m
    where m.organization_id = invitations.organization_id
      and m.user_id = app.current_app_user_id()
      and m.status = 'active'
  )
) with check (
  app.is_system_actor()
  or (tenant_id is not null and app.has_tenant_access(tenant_id))
);

alter table app.outbox_events enable row level security;
alter table app.outbox_events force row level security;
create policy outbox_system_policy on app.outbox_events
for all to gm_app using (
  tenant_id = app.current_tenant_id()
  and (app.is_system_actor() or app.has_tenant_access(tenant_id))
) with check (
  tenant_id = app.current_tenant_id()
  and (app.is_system_actor() or app.has_tenant_access(tenant_id))
);

alter table app.inbox_messages enable row level security;
alter table app.inbox_messages force row level security;
create policy inbox_system_policy on app.inbox_messages
for all to gm_app using (
  tenant_id = app.current_tenant_id() and app.is_system_actor()
) with check (
  tenant_id = app.current_tenant_id() and app.is_system_actor()
);

alter table app.dead_letters enable row level security;
alter table app.dead_letters force row level security;
create policy dead_letters_system_policy on app.dead_letters
for all to gm_app using (
  tenant_id = app.current_tenant_id() and app.is_system_actor()
) with check (
  tenant_id = app.current_tenant_id() and app.is_system_actor()
);

alter table app.audit_logs enable row level security;
alter table app.audit_logs force row level security;
create policy audit_tenant_select on app.audit_logs
for select to gm_app using (
  tenant_id = app.current_tenant_id()
  and (app.is_system_actor() or app.has_tenant_access(tenant_id))
);
create policy audit_insert on app.audit_logs
for insert to gm_app with check (
  tenant_id = app.current_tenant_id()
  and (app.is_system_actor() or app.has_tenant_access(tenant_id))
);

alter table app.recommendation_evidence enable row level security;
alter table app.recommendation_evidence force row level security;
create policy recommendation_evidence_tenant_policy on app.recommendation_evidence
for all to gm_app using (
  exists (
    select 1 from app.recommendations r
    where r.id = recommendation_id
      and r.tenant_id = app.current_tenant_id()
      and (app.is_system_actor() or app.has_tenant_access(r.tenant_id))
  )
) with check (
  exists (
    select 1 from app.recommendations r
    where r.id = recommendation_id
      and r.tenant_id = app.current_tenant_id()
      and (app.is_system_actor() or app.has_tenant_access(r.tenant_id))
  )
);

alter table app.content_assets enable row level security;
alter table app.content_assets force row level security;
create policy content_assets_tenant_policy on app.content_assets
for all to gm_app using (
  exists (
    select 1 from app.content_items c
    where c.id = content_item_id
      and c.tenant_id = app.current_tenant_id()
      and (app.is_system_actor() or app.has_tenant_access(c.tenant_id))
  )
) with check (
  exists (
    select 1 from app.content_items c
    where c.id = content_item_id
      and c.tenant_id = app.current_tenant_id()
      and (app.is_system_actor() or app.has_tenant_access(c.tenant_id))
  )
);

alter table app.ai_run_evidence enable row level security;
alter table app.ai_run_evidence force row level security;
create policy ai_run_evidence_tenant_policy on app.ai_run_evidence
for all to gm_app using (
  exists (
    select 1 from app.ai_runs a
    where a.id = ai_run_id
      and a.tenant_id = app.current_tenant_id()
      and (app.is_system_actor() or app.has_tenant_access(a.tenant_id))
  )
) with check (
  exists (
    select 1 from app.ai_runs a
    where a.id = ai_run_id
      and a.tenant_id = app.current_tenant_id()
      and (app.is_system_actor() or app.has_tenant_access(a.tenant_id))
  )
);

alter table app.feature_flags enable row level security;
alter table app.feature_flags force row level security;
create policy feature_flags_read on app.feature_flags
for select to gm_app using (true);
create policy feature_flags_system_write on app.feature_flags
for all to gm_app using (app.is_system_actor()) with check (app.is_system_actor());

create function app.enqueue_due_jobs()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  enqueued integer := 0;
begin
  with due as (
    select p.id, p.tenant_id, p.idempotency_key, p.scheduled_at
    from app.publications p
    where p.status = 'scheduled'
      and p.scheduled_at <= now() + interval '2 minutes'
      and p.scheduled_at > now() - interval '1 day'
    for update skip locked
  ), inserted as (
    insert into app.outbox_events (
      id, tenant_id, aggregate_type, aggregate_id, event_type, schema_version,
      idempotency_key, payload, trace_id
    )
    select
      extensions.gen_random_uuid(), due.tenant_id, 'publication', due.id,
      'publication_due', '1', due.idempotency_key,
      jsonb_build_object('publication_id', due.id),
      extensions.gen_random_uuid()::text
    from due
    on conflict (idempotency_key) do nothing
    returning 1
  )
  select count(*) into enqueued from inserted;

  return enqueued;
end
$$;

revoke all on function app.enqueue_due_jobs() from public, anon, authenticated;

select cron.schedule(
  'growth-manager-due-jobs',
  '* * * * *',
  $$select app.enqueue_due_jobs()$$
)
where not exists (
  select 1 from cron.job where jobname = 'growth-manager-due-jobs'
);

commit;

