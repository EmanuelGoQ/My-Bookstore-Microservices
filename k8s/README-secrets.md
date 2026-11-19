# Kubernetes Secrets (creados FUERA de Git)

Los Secrets nunca se versionan. Se crean con `kubectl` desde la terminal, una
vez que el cluster y el namespace existen (Fase 5) y conoces el endpoint de RDS
y las contraseñas de los roles de cada base (Fase 4).

Requisito previo:

```bash
kubectl config current-context          # debe apuntar a bookstore-eks
kubectl get ns "$NAMESPACE"             # el namespace debe existir
```

## 1. Secret de identidad de auth (`bookstore-auth`)

El MISMO `AUTH_JWT_SECRET` para toda la flota (>= 32 caracteres). Genera uno
aleatorio y créalo:

```bash
export JWT=$(openssl rand -hex 32)      # 64 hex = 32 bytes, cumple el mínimo

kubectl create secret generic bookstore-auth \
  --namespace "$NAMESPACE" \
  --from-literal=AUTH_JWT_SECRET="$JWT"
```

> Guarda `$JWT` en tu `~/bookstore-env.sh` si quieres recrear el Secret tras un
> reinicio, pero NO lo subas a Git.

## 2. Secret de credenciales de BD (`bookstore-db`)

Una sola instancia RDS con seis bases, cada una con su rol de mínimo privilegio.
El host va en el ConfigMap (`DB_HOST`); aquí solo usuario y contraseña por
servicio. Define las contraseñas (una por rol) y crea el Secret:

```bash
# Contraseñas por rol (elige valores fuertes; aquí se generan al azar)
export CATALOG_PW=$(openssl rand -hex 16)
export USERS_PW=$(openssl rand -hex 16)
export ORDERS_PW=$(openssl rand -hex 16)
export CARTS_PW=$(openssl rand -hex 16)
export WISHLISTS_PW=$(openssl rand -hex 16)
export REVIEWS_PW=$(openssl rand -hex 16)

kubectl create secret generic bookstore-db \
  --namespace "$NAMESPACE" \
  --from-literal=CATALOG_DB_USER=catalog_app \
  --from-literal=CATALOG_DB_PASSWORD="$CATALOG_PW" \
  --from-literal=USERS_DB_USER=user_app \
  --from-literal=USERS_DB_PASSWORD="$USERS_PW" \
  --from-literal=ORDERS_DB_USER=order_app \
  --from-literal=ORDERS_DB_PASSWORD="$ORDERS_PW" \
  --from-literal=CARTS_DB_USER=cart_app \
  --from-literal=CARTS_DB_PASSWORD="$CARTS_PW" \
  --from-literal=WISHLISTS_DB_USER=wishlist_app \
  --from-literal=WISHLISTS_DB_PASSWORD="$WISHLISTS_PW" \
  --from-literal=REVIEWS_DB_USER=review_app \
  --from-literal=REVIEWS_DB_PASSWORD="$REVIEWS_PW"
```

Estas mismas contraseñas se usan al crear los roles en RDS (Fase 4, bootstrap):
cada `*_app` se crea con la contraseña correspondiente.

## 3. Poner el endpoint de RDS en el ConfigMap

Edita `k8s/10-shared-config.yaml` y reemplaza `RDS_ENDPOINT_PLACEHOLDER` por el
endpoint real de RDS antes de aplicarlo:

```bash
sed -i "s/RDS_ENDPOINT_PLACEHOLDER/$RDS_ENDPOINT/" k8s/10-shared-config.yaml
```

## Verificación

```bash
kubectl get secret bookstore-auth bookstore-db -n "$NAMESPACE"
kubectl describe deployment catalog-service -n "$NAMESPACE" | grep -A2 DB_
```

No debe aparecer ninguna contraseña en archivos versionados ni en la salida de
`kubectl get -o yaml` que compartas.
