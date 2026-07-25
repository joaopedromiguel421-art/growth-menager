begin;

create function app.assert_queue_name(queue_name text)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if queue_name not in ('publication', 'delivery', 'render', 'general') then
    raise exception 'Unsupported Growth Manager queue'
      using errcode = '22023';
  end if;
end
$$;

create function app.queue_send(queue_name text, message jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  message_id bigint;
begin
  perform app.assert_queue_name(queue_name);
  select pgmq.send(queue_name, message) into message_id;
  return message_id;
end
$$;

create function app.queue_read(
  queue_name text,
  visibility_timeout integer,
  batch_size integer
)
returns table (msg_id bigint, read_ct integer, message jsonb)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.assert_queue_name(queue_name);
  if visibility_timeout not between 30 and 900 or batch_size not between 1 and 100 then
    raise exception 'Invalid queue read bounds'
      using errcode = '22023';
  end if;

  return query
  select item.msg_id, item.read_ct, item.message
  from pgmq.read(queue_name, visibility_timeout, batch_size) item;
end
$$;

create function app.queue_delete(queue_name text, message_id bigint)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted boolean;
begin
  perform app.assert_queue_name(queue_name);
  select pgmq.delete(queue_name, message_id) into deleted;
  return deleted;
end
$$;

create function app.deadletter_job(
  queue_name text,
  queue_message_id bigint,
  target_tenant_id uuid,
  target_job_type text,
  target_payload jsonb,
  target_error jsonb,
  target_attempts integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.assert_queue_name(queue_name);

  insert into app.dead_letters (
    id, tenant_id, queue, message_id, job_type, payload, error, attempts
  ) values (
    extensions.gen_random_uuid(), target_tenant_id, queue_name, queue_message_id::text,
    left(target_job_type, 100), target_payload, target_error, target_attempts
  )
  on conflict (queue, message_id) do nothing;

  perform pgmq.archive(queue_name, queue_message_id);
end
$$;

create function app.relay_outbox(batch_size integer default 20)
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
      else 'sync'
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

revoke all on function app.assert_queue_name(text) from public, anon, authenticated;
revoke all on function app.queue_send(text, jsonb) from public, anon, authenticated;
revoke all on function app.queue_read(text, integer, integer) from public, anon, authenticated;
revoke all on function app.queue_delete(text, bigint) from public, anon, authenticated;
revoke all on function app.deadletter_job(text, bigint, uuid, text, jsonb, jsonb, integer)
  from public, anon, authenticated;
revoke all on function app.relay_outbox(integer) from public, anon, authenticated;

grant execute on function app.queue_send(text, jsonb) to gm_app;
grant execute on function app.queue_read(text, integer, integer) to gm_app;
grant execute on function app.queue_delete(text, bigint) to gm_app;
grant execute on function app.deadletter_job(text, bigint, uuid, text, jsonb, jsonb, integer)
  to gm_app;
grant execute on function app.relay_outbox(integer) to gm_app;

commit;
