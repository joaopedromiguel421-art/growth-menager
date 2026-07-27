begin;

insert into app.feature_flags (key, environment, enabled, rules, owner)
values
  ('seo_monitoring', 'production', false, '{}'::jsonb, 'growth-engineering'),
  ('seo_deepseek', 'production', false, '{}'::jsonb, 'growth-engineering'),
  ('seo_auto_tasks', 'production', false, '{}'::jsonb, 'growth-engineering')
on conflict (key, environment) do nothing;

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
    raise exception 'Invalid relay batch size' using errcode = '22023';
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
      when event_record.event_type in ('seo_report_requested') then 'render'
      when event_record.event_type like '%report%' then 'render'
      else 'general'
    end;
    job_type := case event_record.event_type
      when 'publication_due' then 'publish_content'
      when 'seo_analysis_requested' then 'seo_analysis_plan'
      when 'seo_capability_requested' then 'seo_capability_execute'
      when 'seo_analysis_ready' then 'seo_analysis_aggregate'
      when 'seo_baseline_ready' then 'seo_baseline_compare'
      when 'seo_report_requested' then 'seo_report_render'
      else case
        when event_record.event_type like '%delivery%' then 'deliver_report'
        when event_record.event_type like '%report%' then 'render_report'
        else 'sync'
      end
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

    update app.outbox_events set published_at = now() where id = event_record.id;
    relayed := relayed + 1;
  end loop;
  return relayed;
end
$$;

create function app.enqueue_due_seo_analyses(target_environment text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  enqueued integer := 0;
begin
  if not exists (
    select 1 from app.feature_flags flag
    where flag.key = 'seo_monitoring'
      and flag.environment = target_environment
      and flag.enabled
      and (flag.expires_at is null or flag.expires_at > now())
  ) then
    return 0;
  end if;

  with due as (
    select profile.*, target.status as target_status
    from app.seo_monitoring_profiles profile
    join app.seo_targets target
      on target.tenant_id = profile.tenant_id and target.id = profile.target_id
    where target.status = 'active'
      and (
        profile.next_daily_at <= now()
        or profile.next_weekly_at <= now()
        or profile.next_monthly_at <= now()
      )
    for update of profile skip locked
  ), inserted as (
    insert into app.seo_analysis_runs (
      id, tenant_id, target_id, mode, status, planner_version, config_version,
      requested_capabilities, idempotency_key, currency
    )
    select
      gen_random_uuid(), due.tenant_id, due.target_id, 'periodic', 'queued',
      'seo-planner-v1', 'seo-profile-v' || due.version::text,
      due.enabled_capabilities,
      'schedule:' || due.target_id::text || ':' || to_char(now() at time zone 'UTC', 'YYYY-MM-DD'),
      due.currency
    from due
    on conflict (tenant_id, idempotency_key) do nothing
    returning *
  ), events as (
    insert into app.outbox_events (
      id, tenant_id, aggregate_type, aggregate_id, event_type, schema_version,
      idempotency_key, payload, trace_id
    )
    select
      gen_random_uuid(), inserted.tenant_id, 'seo_analysis', inserted.id,
      'seo_analysis_requested', '1',
      'seo:schedule:' || inserted.tenant_id::text || ':' || inserted.id::text,
      jsonb_build_object(
        'analysis_run_id', inserted.id,
        'due_daily', due.next_daily_at <= now(),
        'due_weekly', due.next_weekly_at <= now(),
        'due_monthly', due.next_monthly_at <= now()
      ), gen_random_uuid()::text
    from inserted
    join due on due.tenant_id = inserted.tenant_id and due.target_id = inserted.target_id
    returning 1
  ), advanced as (
    update app.seo_monitoring_profiles profile
    set next_daily_at = case when profile.next_daily_at <= now() then now() + interval '1 day' else profile.next_daily_at end,
        next_weekly_at = case when profile.next_weekly_at <= now() then now() + interval '7 days' else profile.next_weekly_at end,
        next_monthly_at = case when profile.next_monthly_at <= now() then now() + interval '1 month' else profile.next_monthly_at end,
        updated_at = now(),
        version = profile.version + 1
    from due
    where profile.id = due.id
    returning 1
  )
  select count(*) into enqueued from events;
  return enqueued;
end
$$;

revoke all on function app.enqueue_due_seo_analyses(text) from public, anon, authenticated;
grant execute on function app.enqueue_due_seo_analyses(text) to gm_app;

select cron.schedule(
  'growth-manager-seo-monitoring',
  '*/15 * * * *',
  $$select app.enqueue_due_seo_analyses('production')$$
)
where not exists (
  select 1 from cron.job where jobname = 'growth-manager-seo-monitoring'
);

commit;
