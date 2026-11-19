#!/bin/sh
# RDS bootstrap for the six-databases topology, run from INSIDE the cluster
# (the EKS nodes can reach RDS on 5432; your laptop cannot). Connects as the
# RDS master user and, for each service:
#   1. creates the database if missing,
#   2. creates/updates the least-privilege app role with its password,
#   3. applies schema.sql (+ seed.sql for catalog and users),
#   4. grants least-privilege on that database.
#
# Required environment variables (injected by the Kubernetes Job):
#   PGHOST            RDS endpoint
#   PGPORT            5432
#   PGUSER            RDS master user (bookstore_admin)
#   PGPASSWORD        RDS master password
#   CATALOG_DB_PASSWORD, USERS_DB_PASSWORD, ORDERS_DB_PASSWORD,
#   CARTS_DB_PASSWORD, WISHLISTS_DB_PASSWORD, REVIEWS_DB_PASSWORD
#
# The SQL files live under $DB_DIR (the repo's databases/ directory).
set -eu

DB_DIR="${DB_DIR:-/repo/databases}"
export PGSSLMODE="${PGSSLMODE:-require}"

log() { printf '\n[bootstrap] %s\n' "$1"; }

# admin_sql <sql>  -> run a statement against the default 'postgres' database
admin_sql() {
  psql -v ON_ERROR_STOP=1 -d postgres -c "$1"
}

# create_db <dbname> : CREATE DATABASE if it does not already exist
create_db() {
  db="$1"
  exists=$(psql -tAc "SELECT 1 FROM pg_database WHERE datname='${db}'" -d postgres)
  if [ "${exists}" = "1" ]; then
    log "database ${db} already exists"
  else
    log "creating database ${db}"
    admin_sql "CREATE DATABASE ${db}"
  fi
}

# upsert_role <role> <password> : create or update a least-privilege login role
upsert_role() {
  role="$1"
  pw="$2"
  exists=$(psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${role}'" -d postgres)
  if [ "${exists}" = "1" ]; then
    log "updating role ${role}"
    admin_sql "ALTER ROLE ${role} LOGIN PASSWORD '${pw}'"
  else
    log "creating role ${role}"
    admin_sql "CREATE ROLE ${role} LOGIN PASSWORD '${pw}'"
  fi
}

# apply_sql <dbname> <file> : run a SQL file against a database (skip if absent)
apply_sql() {
  db="$1"
  file="$2"
  [ -f "${file}" ] || { log "skip (not found): ${file}"; return 0; }
  log "applying ${file} -> ${db}"
  psql -v ON_ERROR_STOP=1 -d "${db}" -f "${file}"
}

# grant_db <dbname> <role> : least-privilege grants on the public schema
grant_db() {
  db="$1"
  role="$2"
  log "granting privileges on ${db} to ${role}"
  psql -v ON_ERROR_STOP=1 -d "${db}" <<SQL
GRANT CONNECT ON DATABASE ${db} TO ${role};
GRANT USAGE ON SCHEMA public TO ${role};
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${role};
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${role};
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${role};
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO ${role};
SQL
}

# --- one entry per service: db role password-var schema seed ---
bootstrap_service() {
  db="$1"; role="$2"; pw="$3"; schema="$4"; seed="$5"
  create_db "${db}"
  upsert_role "${role}" "${pw}"
  apply_sql "${db}" "${schema}"
  [ -n "${seed}" ] && apply_sql "${db}" "${seed}"
  grant_db "${db}" "${role}"
}

log "Bootstrapping RDS at ${PGHOST}:${PGPORT}"

bootstrap_service catalog   catalog_app  "${CATALOG_DB_PASSWORD}"   "${DB_DIR}/catalog/schema.sql"   "${DB_DIR}/catalog/seed.sql"
bootstrap_service users     user_app     "${USERS_DB_PASSWORD}"     "${DB_DIR}/users/schema.sql"     "${DB_DIR}/users/seed.sql"
bootstrap_service orders    order_app    "${ORDERS_DB_PASSWORD}"    "${DB_DIR}/orders/schema.sql"    ""
bootstrap_service carts     cart_app     "${CARTS_DB_PASSWORD}"     "${DB_DIR}/carts/schema.sql"     ""
bootstrap_service wishlists wishlist_app "${WISHLISTS_DB_PASSWORD}" "${DB_DIR}/wishlists/schema.sql" ""
bootstrap_service reviews   review_app   "${REVIEWS_DB_PASSWORD}"   "${DB_DIR}/reviews/schema.sql"   ""

log "RDS bootstrap completed successfully."
