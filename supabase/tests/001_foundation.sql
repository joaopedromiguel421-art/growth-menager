begin;
select plan(10);

select has_schema('app', 'domain schema exists');
select has_table('app', 'tenants', 'tenants table exists');
select has_table('app', 'memberships', 'memberships table exists');
select has_table('app', 'outbox_events', 'transactional outbox exists');
select has_table('app', 'inbox_messages', 'consumer inbox exists');
select has_table('app', 'dead_letters', 'application DLQ exists');
select has_function('app', 'relay_outbox', array['integer'], 'outbox relay is installed');
select has_function(
  'app',
  'queue_read',
  array['text', 'integer', 'integer'],
  'bounded queue reader is installed'
);
select is(
  (select relforcerowsecurity from pg_class where oid = 'app.tasks'::regclass),
  true,
  'tenant table forces RLS'
);
select is(
  (select relforcerowsecurity from pg_class where oid = 'app.audit_logs'::regclass),
  true,
  'audit table forces RLS'
);

select * from finish();
rollback;

