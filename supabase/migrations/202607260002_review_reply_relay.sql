begin;

-- app.reviews and app.review_replies have existed since the domain model
-- migration, but nothing ever emitted a review_reply_publish_due event, so the
-- Reviews module had no way to reach the worker once an approval was granted.
-- Without this case the event would fall through to job_type 'notify', which
-- job-processor.ts treats as a no-op — the reply would sit approved forever.
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
      when event_record.event_type = 'review_reply_publish_due' then 'publish_reply'
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
