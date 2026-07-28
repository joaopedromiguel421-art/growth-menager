begin;
select plan(7);

insert into app.organizations (id, name, slug, billing_email)
values (
  '10000000-0000-0000-0000-000000000001',
  'OAuth test organization',
  'oauth-test-organization',
  'oauth-test@example.com'
);

insert into app.tenants (id, organization_id, name, slug, timezone)
values (
  '10000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000001',
  'OAuth test tenant',
  'oauth-test-tenant',
  'America/Sao_Paulo'
);

insert into app.integration_connections (
  id,
  tenant_id,
  provider,
  status,
  metadata
)
values (
  '10000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000002',
  'search_console',
  'pending_auth',
  jsonb_build_object(
    'oauth',
    jsonb_build_object(
      'state_hash', 'oauth-state-hash',
      'code_verifier', 'pkce-verifier',
      'redirect_path', '/app/connections',
      'expires_at', (now() + interval '10 minutes')::text
    )
  )
);

create temporary table claimed_oauth_state as
select * from app.claim_oauth_state('oauth-state-hash');

select is((select count(*)::integer from claimed_oauth_state), 1, 'state is claimed once');
select is(
  (select connection_id from claimed_oauth_state),
  '10000000-0000-0000-0000-000000000003'::uuid,
  'claim returns the connection'
);
select is(
  (select tenant_id from claimed_oauth_state),
  '10000000-0000-0000-0000-000000000002'::uuid,
  'claim returns the tenant'
);
select is((select provider from claimed_oauth_state), 'search_console', 'claim returns provider');
select is(
  (select code_verifier from claimed_oauth_state),
  'pkce-verifier',
  'claim preserves the PKCE verifier'
);
select is(
  (select redirect_path from claimed_oauth_state),
  '/app/connections',
  'claim preserves the redirect path'
);
select is(
  (select count(*)::integer from app.claim_oauth_state('oauth-state-hash')),
  0,
  'claimed state cannot be replayed'
);

select * from finish();
rollback;
