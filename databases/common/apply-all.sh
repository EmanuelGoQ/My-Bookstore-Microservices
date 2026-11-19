#!/bin/sh
# Applies every service schema (and the catalog/user seeds) to the shared local
# Postgres. Idempotent: schemas use IF NOT EXISTS and seeds use ON CONFLICT.
set -eu

DB_DIR="/databases"

apply() {
  db="$1"
  file="$2"
  [ -f "${file}" ] || return 0
  echo "Applying ${file} -> ${db}"
  psql -v ON_ERROR_STOP=1 -d "${db}" -f "${file}"
}

apply catalog   "${DB_DIR}/catalog/schema.sql"
apply catalog   "${DB_DIR}/catalog/seed.sql"
apply users     "${DB_DIR}/users/schema.sql"
apply users     "${DB_DIR}/users/seed.sql"
apply orders    "${DB_DIR}/orders/schema.sql"
apply carts     "${DB_DIR}/carts/schema.sql"
apply wishlists "${DB_DIR}/wishlists/schema.sql"
apply reviews   "${DB_DIR}/reviews/schema.sql"

echo "All service schemas applied."
