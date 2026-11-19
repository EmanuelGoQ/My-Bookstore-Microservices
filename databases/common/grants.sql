-- Least-privilege runtime grants for a per-service database.
-- Required psql variables: db_name, app_user
\set ON_ERROR_STOP on

GRANT CONNECT ON DATABASE :"db_name" TO :"app_user";
GRANT USAGE ON SCHEMA public TO :"app_user";
GRANT SELECT, INSERT, UPDATE, DELETE
  ON ALL TABLES IN SCHEMA public
  TO :"app_user";
GRANT USAGE, SELECT
  ON ALL SEQUENCES IN SCHEMA public
  TO :"app_user";

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"app_user";
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO :"app_user";
