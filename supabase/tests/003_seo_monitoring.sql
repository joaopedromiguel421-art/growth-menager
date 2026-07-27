begin;
select plan(12);

select has_table('app', 'seo_targets', 'SEO targets exist');
select has_table('app', 'seo_analysis_runs', 'SEO analysis runs exist');
select has_table('app', 'seo_capability_runs', 'SEO capability runs exist');
select has_table('app', 'seo_page_snapshots', 'SEO page snapshots exist');
select has_table('app', 'seo_findings', 'SEO findings exist');
select has_table('app', 'seo_baselines', 'SEO baselines exist');
select has_table('app', 'cost_reservations', 'paid calls reserve cost');

select col_not_null('app', 'seo_findings', 'tenant_id', 'findings require tenant');
select col_not_null(
  'app',
  'seo_finding_evidence',
  'tenant_id',
  'finding evidence relations require tenant'
);

select is(
  (
    select bool_and(class.relforcerowsecurity)
    from pg_class class
    join pg_namespace namespace on namespace.oid = class.relnamespace
    where namespace.nspname = 'app'
      and class.relname = any(array[
        'seo_targets', 'seo_monitoring_profiles', 'seo_analysis_runs',
        'seo_capability_runs', 'seo_pages', 'seo_page_snapshots', 'seo_findings',
        'seo_finding_evidence', 'seo_baselines', 'seo_comparisons', 'seo_keywords',
        'seo_competitors', 'seo_geogrid_runs', 'seo_geogrid_points', 'cost_reservations'
      ])
  ),
  true,
  'all tenant SEO tables force RLS'
);

select trigger_is(
  'app',
  'seo_page_snapshots',
  'seo_page_snapshots_append_only',
  'app',
  'reject_append_only_mutation',
  'page snapshots are append-only'
);

select is(
  (
    select enabled
    from app.feature_flags
    where key = 'seo_monitoring'
      and environment = 'production'
  ),
  false,
  'SEO monitoring is disabled in production by default'
);

select * from finish();
rollback;
