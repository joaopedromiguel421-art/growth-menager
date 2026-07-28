begin;
select plan(8);

select has_table('app', 'brand_kits', 'brand kit persistence exists');
select has_table('app', 'content_items', 'content persistence exists');
select has_table('app', 'publications', 'publication persistence exists');
select has_table('app', 'report_snapshots', 'report snapshot persistence exists');
select has_column('app', 'content_assets', 'tenant_id', 'content asset links carry tenant context');
select is(
  (select relforcerowsecurity from pg_class where oid = 'app.content_assets'::regclass),
  true,
  'content asset links force RLS'
);
select has_function('app', 'invoke_worker_pump', array[]::text[], 'continuous worker trigger exists');
select is(
  (
    select count(*)::integer
    from pg_indexes
    where schemaname = 'app'
      and tablename = 'publications'
      and indexname = 'publications_tenant_status_schedule_idx'
  ),
  1,
  'publication tenant scheduler index exists'
);

select * from finish();
rollback;
