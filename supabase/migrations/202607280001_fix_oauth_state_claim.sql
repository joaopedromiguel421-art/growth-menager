begin;

-- Capture the PKCE verifier in the locked candidate row before removing the
-- single-use OAuth payload. Returning values from the updated JSON previously
-- returned null because `metadata.oauth` had already been deleted.
create or replace function app.claim_oauth_state(p_state_hash text)
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
  with pending as materialized (
    select c.id,
           c.tenant_id,
           c.provider::text as provider,
           c.metadata #>> '{oauth,code_verifier}' as code_verifier,
           c.metadata #>> '{oauth,redirect_path}' as redirect_path
    from app.integration_connections c
    where c.metadata #>> '{oauth,state_hash}' = p_state_hash
      and c.status = 'pending_auth'
      and (c.metadata #>> '{oauth,expires_at}')::timestamptz > now()
    order by c.created_at
    for update skip locked
    limit 1
  ), updated as (
    update app.integration_connections c
    set metadata = c.metadata - 'oauth',
        updated_at = now(),
        version = c.version + 1
    from pending p
    where c.id = p.id
    returning c.id as connection_id,
              p.tenant_id,
              p.provider,
              p.code_verifier,
              p.redirect_path
  )
  select u.connection_id,
         u.tenant_id,
         u.provider,
         u.code_verifier,
         u.redirect_path
  from updated u
$$;

revoke all on function app.claim_oauth_state(text) from public;
grant execute on function app.claim_oauth_state(text) to gm_app;

commit;
