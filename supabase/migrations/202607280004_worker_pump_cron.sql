begin;

-- Supabase Cron invokes the deployed worker frequently. Both values stay in
-- Vault so neither the worker URL nor its bearer secret enters source control.
create or replace function app.invoke_worker_pump()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  worker_url text;
  cron_secret text;
  request_id bigint;
begin
  select decrypted_secret into worker_url
  from vault.decrypted_secrets
  where name = 'growth_manager_worker_pump_url'
  order by created_at desc
  limit 1;

  select decrypted_secret into cron_secret
  from vault.decrypted_secrets
  where name = 'growth_manager_worker_cron_secret'
  order by created_at desc
  limit 1;

  if worker_url is null or cron_secret is null then
    return null;
  end if;

  select net.http_post(
    url := worker_url,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || cron_secret,
      'Content-Type', 'application/json'
    ),
    body := '{"source":"supabase_cron"}'::jsonb,
    timeout_milliseconds := 25000
  ) into request_id;
  return request_id;
end
$$;

revoke all on function app.invoke_worker_pump() from public, anon, authenticated;
grant execute on function app.invoke_worker_pump() to gm_app;

select cron.schedule(
  'growth-manager-worker-pump',
  '*/2 * * * *',
  $$select app.invoke_worker_pump()$$
)
where not exists (
  select 1 from cron.job where jobname = 'growth-manager-worker-pump'
);

commit;
