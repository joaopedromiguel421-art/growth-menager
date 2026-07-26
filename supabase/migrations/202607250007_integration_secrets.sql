begin;

-- OAuth refresh tokens must never sit in an app table: integration_connections
-- only keeps secret_ref, and the token itself lives in Supabase Vault. gm_api has
-- no rights on the vault schema, so these security definer functions are the only
-- door, and each one re-checks tenant access before touching a secret.

create function app.integration_secret_name(p_connection_id uuid)
returns text
language sql
immutable
parallel safe
as $$
  select 'integration_connection:' || p_connection_id::text
$$;

create function app.assert_connection_access(p_connection_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid;
begin
  select tenant_id into v_tenant_id
  from app.integration_connections
  where id = p_connection_id;

  if v_tenant_id is null then
    raise exception 'GM-INTEGRATION-NOT-FOUND' using errcode = 'no_data_found';
  end if;

  -- The system actor bypass mirrors the tenant RLS policy so worker jobs can read
  -- credentials for a sync they were already authorized to enqueue.
  if v_tenant_id <> app.current_tenant_id()
     or not (app.is_system_actor() or app.has_tenant_access(v_tenant_id)) then
    raise exception 'GM-AUTHZ-TENANT-MISMATCH' using errcode = 'insufficient_privilege';
  end if;

  return v_tenant_id;
end
$$;

create function app.store_integration_secret(p_connection_id uuid, p_secret text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_existing uuid;
begin
  perform app.assert_connection_access(p_connection_id);
  v_name := app.integration_secret_name(p_connection_id);

  select id into v_existing from vault.secrets where name = v_name;

  if v_existing is null then
    perform vault.create_secret(p_secret, v_name, 'OAuth credential for an integration connection');
  else
    perform vault.update_secret(v_existing, p_secret, v_name);
  end if;

  return v_name;
end
$$;

create function app.read_integration_secret(p_connection_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text;
begin
  perform app.assert_connection_access(p_connection_id);

  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = app.integration_secret_name(p_connection_id);

  return v_secret;
end
$$;

create function app.delete_integration_secret(p_connection_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.assert_connection_access(p_connection_id);
  delete from vault.secrets where name = app.integration_secret_name(p_connection_id);
end
$$;

-- Google redirects the browser straight to the callback, so that request carries no
-- session and no tenant header and cannot satisfy the tenant RLS policy. Claiming
-- the pending state is therefore the one lookup that has to run above RLS, and it
-- clears the state in the same statement so a replayed callback finds nothing.
create function app.claim_oauth_state(p_state_hash text)
returns table (
  connection_id uuid,
  tenant_id uuid,
  provider text,
  code_verifier text,
  redirect_path text
)
language sql
security definer
set search_path = ''
as $$
  update app.integration_connections c
  set metadata = c.metadata - 'oauth',
      updated_at = now(),
      version = c.version + 1
  where c.id = (
    select id
    from app.integration_connections
    where metadata #>> '{oauth,state_hash}' = p_state_hash
      and status = 'pending_auth'
      and (metadata #>> '{oauth,expires_at}')::timestamptz > now()
    limit 1
  )
  returning c.id,
            c.tenant_id,
            c.provider::text,
            c.metadata #>> '{oauth,code_verifier}',
            c.metadata #>> '{oauth,redirect_path}'
$$;

revoke all on function app.claim_oauth_state(text) from public;
grant execute on function app.claim_oauth_state(text) to gm_app;

revoke all on function app.integration_secret_name(uuid) from public;
revoke all on function app.assert_connection_access(uuid) from public;
revoke all on function app.store_integration_secret(uuid, text) from public;
revoke all on function app.read_integration_secret(uuid) from public;
revoke all on function app.delete_integration_secret(uuid) from public;

grant execute on function app.store_integration_secret(uuid, text) to gm_app;
grant execute on function app.read_integration_secret(uuid) to gm_app;
grant execute on function app.delete_integration_secret(uuid) to gm_app;

commit;
