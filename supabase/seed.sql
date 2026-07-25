-- Reference data only. Production never runs fixtures from this file.
insert into app.feature_flags (key, environment, enabled, rules, owner)
values
  ('passkeys', 'development', false, '{}'::jsonb, 'Identity'),
  ('real_providers', 'development', false, '{}'::jsonb, 'Integrations'),
  ('passkeys', 'production', false, '{}'::jsonb, 'Identity'),
  ('real_providers', 'production', false, '{}'::jsonb, 'Integrations')
on conflict (key, environment) do update
set enabled = excluded.enabled, rules = excluded.rules, owner = excluded.owner;

