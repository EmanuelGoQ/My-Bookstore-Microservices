#!/usr/bin/env bash

set -Eeuo pipefail

# ============================================================
# Per-service database bootstrap.
#
# Creates the service's least-privilege app role, applies its schema, grants,
# and (optionally) seed, against an existing PostgreSQL database owned by an
# admin role. One invocation per microservice database.
#
# Required environment variables:
#   DB_HOST, DB_PORT, DB_NAME
#   DB_ADMIN_USER, DB_ADMIN_PASSWORD
#   APP_DB_USER, APP_DB_PASSWORD
#   SERVICE                  one of: catalog users orders carts reviews wishlists
# Optional:
#   PGSSLMODE                (default: require)
#   SEED                     "true" to load seed.sql if present (default: false)
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATABASES_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

log() { printf '\n[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1"; }
fail() { printf '\nERROR: %s\n' "$1" >&2; exit 1; }

: "${DB_HOST:?DB_HOST is required}"
: "${DB_PORT:=5432}"
: "${DB_NAME:?DB_NAME is required}"
: "${DB_ADMIN_USER:?DB_ADMIN_USER is required}"
: "${DB_ADMIN_PASSWORD:?DB_ADMIN_PASSWORD is required}"
: "${APP_DB_USER:?APP_DB_USER is required}"
: "${APP_DB_PASSWORD:?APP_DB_PASSWORD is required}"
: "${SERVICE:?SERVICE is required}"
: "${PGSSLMODE:=require}"
: "${SEED:=false}"

SERVICE_DIR="${DATABASES_DIR}/${SERVICE}"
SCHEMA_SQL="${SERVICE_DIR}/schema.sql"
SEED_SQL="${SERVICE_DIR}/seed.sql"
CREATE_ROLE_SQL="${SCRIPT_DIR}/create_role.sql"
GRANTS_SQL="${SCRIPT_DIR}/grants.sql"

[[ -f "${SCHEMA_SQL}" ]] || fail "Schema not found for service '${SERVICE}': ${SCHEMA_SQL}"
command -v psql >/dev/null 2>&1 || fail "psql is not installed or not in PATH."

export PGHOST="${DB_HOST}" PGPORT="${DB_PORT}" PGDATABASE="${DB_NAME}"
export PGUSER="${DB_ADMIN_USER}" PGPASSWORD="${DB_ADMIN_PASSWORD}" PGSSLMODE="${PGSSLMODE}"

log "Bootstrapping '${SERVICE}' database on ${DB_HOST}:${DB_PORT}/${DB_NAME}"

log "Creating or reconciling application role"
psql -X -v ON_ERROR_STOP=1 \
  -v app_user="${APP_DB_USER}" \
  -v app_password="${APP_DB_PASSWORD}" \
  -f "${CREATE_ROLE_SQL}"

log "Applying schema"
psql -X -v ON_ERROR_STOP=1 -f "${SCHEMA_SQL}"

log "Configuring runtime privileges"
psql -X -v ON_ERROR_STOP=1 \
  -v db_name="${DB_NAME}" \
  -v app_user="${APP_DB_USER}" \
  -f "${GRANTS_SQL}"

if [[ "${SEED}" == "true" && -f "${SEED_SQL}" ]]; then
  log "Loading seed data"
  psql -X -v ON_ERROR_STOP=1 -f "${SEED_SQL}"
fi

unset PGPASSWORD
log "Bootstrap for '${SERVICE}' completed successfully"
