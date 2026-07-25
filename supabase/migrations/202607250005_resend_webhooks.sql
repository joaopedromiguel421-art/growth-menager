begin;

create function app.ingest_resend_event(
  external_id text,
  event_type text,
  object_key text,
  object_sha256 text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_count integer;
begin
  if external_id = '' or length(object_sha256) <> 64 then
    raise exception 'Invalid Resend event'
      using errcode = '22023';
  end if;

  insert into app.webhook_events (
    id, provider, external_event_id, tenant_id, occurred_at, signature_valid,
    payload_ref, payload_sha256, status
  ) values (
    extensions.gen_random_uuid(), 'resend', external_id, null, null, true,
    object_key, object_sha256, 'received'
  )
  on conflict (provider, external_event_id) do nothing;
  get diagnostics inserted_count = row_count;

  -- Reconciliation resolves the provider message id to a tenant-scoped delivery
  -- before a queue message is created. Global jobs are intentionally forbidden.
  return inserted_count > 0;
end
$$;

revoke all on function app.ingest_resend_event(text, text, text, text)
  from public, anon, authenticated;
grant execute on function app.ingest_resend_event(text, text, text, text) to gm_app;

commit;
