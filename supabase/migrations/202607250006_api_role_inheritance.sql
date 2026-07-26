-- The API logs in as gm_api, a NOINHERIT role that is only a *member* of gm_app.
-- Under PostgreSQL 16+ a membership granted to a NOINHERIT role defaults to
-- INHERIT FALSE, so gm_api received neither the table grants nor any policy
-- scoped `to gm_app`: with FORCE ROW LEVEL SECURITY every tenant query silently
-- resolved to zero rows or a permission error. Re-grant the membership with
-- inheritance so the RLS model actually applies to the API session.
grant gm_app to gm_api with inherit true;
