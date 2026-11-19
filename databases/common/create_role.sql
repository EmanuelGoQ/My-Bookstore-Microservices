-- Idempotently create/reconcile the per-service application login role.
-- Required psql variables: app_user, app_password
\set ON_ERROR_STOP on

SELECT format(
  CASE
    WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_user')
      THEN 'ALTER ROLE %I LOGIN PASSWORD %L'
    ELSE 'CREATE ROLE %I LOGIN PASSWORD %L'
  END,
  :'app_user',
  :'app_password'
)
\gexec
