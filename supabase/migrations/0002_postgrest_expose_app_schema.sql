-- Expose the `app` service schema to PostgREST.
--
-- The SECURITY DEFINER wrappers shipped in `0001_init_schema.sql`
-- (app.my_workspace, app.get_workspace_state, app.save_workspace_state, ...)
-- live in the `app` schema, but PostgREST only resolves RPCs for schemas
-- listed in `pgrst.db_schemas` (default: `public, graphql_public`). Without
-- this exposure every `/rest/v1/rpc/app.*` call returns HTTP 404 / PGRST202
-- ("Could not find the function … in the schema cache").
--
-- The `authenticator` role is the connection role PostgREST uses for function
-- resolution, so the exposed-schema list must be set on it (and mirrored on
-- `anon` so unauthenticated RPC resolution keeps working). The reload notifies
-- a running PostgREST instance to rebuild its schema cache without a restart.

alter role authenticator in database postgres
  set pgrst.db_schemas = 'public, graphql_public, app';

alter role anon in database postgres
  set pgrst.db_schemas = 'public, graphql_public, app';

-- PostgREST must be able to traverse the schema before it can cache and call
-- the functions it contains.
grant usage on schema app to authenticator;

notify pgrst, 'reload schema';