#!/usr/bin/env bash
#
# secrets-up.sh — Crea los tres Secrets de Kubernetes (fuera de Git).
# Requiere: namespace creado y ~/bookstore-env.sh cargado (RDS_MASTER_PW, etc.).
#
# Reutiliza contraseñas de ~/bookstore-env.sh si existen; si no, las genera y
# las añade al archivo para que el bootstrap de RDS use las mismas.
set -Eeuo pipefail

: "${NAMESPACE:?source ~/bookstore-env.sh first}"
: "${RDS_MASTER_PW:?RDS_MASTER_PW missing (source ~/bookstore-env.sh)}"
ENV_FILE="$HOME/bookstore-env.sh"

kubectl get namespace "$NAMESPACE" >/dev/null 2>&1 || kubectl create namespace "$NAMESPACE"

# Persist a var into the env file if it is not already there.
persist() { grep -q "^export $1=" "$ENV_FILE" 2>/dev/null || echo "export $1=$2" >> "$ENV_FILE"; }

: "${JWT:=$(openssl rand -hex 32)}";               persist JWT "$JWT"
: "${CATALOG_PW:=$(openssl rand -hex 16)}";         persist CATALOG_PW "$CATALOG_PW"
: "${USERS_PW:=$(openssl rand -hex 16)}";           persist USERS_PW "$USERS_PW"
: "${ORDERS_PW:=$(openssl rand -hex 16)}";          persist ORDERS_PW "$ORDERS_PW"
: "${CARTS_PW:=$(openssl rand -hex 16)}";           persist CARTS_PW "$CARTS_PW"
: "${WISHLISTS_PW:=$(openssl rand -hex 16)}";       persist WISHLISTS_PW "$WISHLISTS_PW"
: "${REVIEWS_PW:=$(openssl rand -hex 16)}";         persist REVIEWS_PW "$REVIEWS_PW"

# Recreate secrets idempotently (delete + create).
kubectl delete secret bookstore-auth bookstore-db bookstore-rds-admin -n "$NAMESPACE" --ignore-not-found

kubectl create secret generic bookstore-auth -n "$NAMESPACE" \
  --from-literal=AUTH_JWT_SECRET="$JWT"

kubectl create secret generic bookstore-db -n "$NAMESPACE" \
  --from-literal=CATALOG_DB_USER=catalog_app    --from-literal=CATALOG_DB_PASSWORD="$CATALOG_PW" \
  --from-literal=USERS_DB_USER=user_app         --from-literal=USERS_DB_PASSWORD="$USERS_PW" \
  --from-literal=ORDERS_DB_USER=order_app       --from-literal=ORDERS_DB_PASSWORD="$ORDERS_PW" \
  --from-literal=CARTS_DB_USER=cart_app         --from-literal=CARTS_DB_PASSWORD="$CARTS_PW" \
  --from-literal=WISHLISTS_DB_USER=wishlist_app --from-literal=WISHLISTS_DB_PASSWORD="$WISHLISTS_PW" \
  --from-literal=REVIEWS_DB_USER=review_app     --from-literal=REVIEWS_DB_PASSWORD="$REVIEWS_PW"

kubectl create secret generic bookstore-rds-admin -n "$NAMESPACE" \
  --from-literal=RDS_MASTER_USER=bookstore_admin \
  --from-literal=RDS_MASTER_PASSWORD="$RDS_MASTER_PW"

echo "[secrets-up] Secrets creados:"
kubectl get secrets -n "$NAMESPACE"
