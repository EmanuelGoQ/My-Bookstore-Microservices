# Redespliegue completo + frontend HTTPS (Cloudflare)

Guía para dejar la app funcionando de punta a punta en el navegador tras:
- el cambio a autenticación por Bearer token,
- `CORS_ORIGINS` fijado al dominio de Cloudflare Pages,
- las pantallas nuevas de wishlist y reviews,
- y la resolución de "mixed content" exponiendo el backend por HTTPS.

Variables base (recargar tras reiniciar el Lab):

```bash
source ~/bookstore-env.sh
export FRONT_ORIGIN=https://bookstore-eafit.pages.dev
```

## Vía rápida con scripts (recomendada)

```bash
aws sts get-caller-identity                       # credenciales del Lab activas
export AWS_REGION=us-east-1 CLUSTER=bookstore-eks NAMESPACE=bookstore
bash scripts/infra-up.sh && source ~/bookstore-env.sh   # red + RDS (idempotente)
eksctl create cluster -f k8s/eksctl-cluster.yaml        # cluster (~20 min)
aws eks update-kubeconfig --region "$AWS_REGION" --name "$CLUSTER"
bash scripts/secrets-up.sh                               # 3 secrets
bash scripts/deploy.sh                                   # config+bootstrap+servicios+gateway+fluent-bit
cloudflared tunnel --url "http://$API_LB"                # HTTPS para el backend
# -> pon la URL del túnel en frontend/public/runtime-config.js y redeploy a Pages
```

Los pasos manuales equivalentes quedan documentados abajo por si algo falla.

## 0. Commit + push de los cambios

Backend, config y frontend cambiaron. Commitea por áreas (sin secretos):

```bash
git add services/shared/auth.js \
        services/user-service/src/controllers/authController.js \
        k8s/10-shared-config.yaml \
        frontend/src frontend/.env.example \
        k8s/REDEPLOY-AND-FRONTEND.md
git commit -m "feat: bearer-token auth, wishlist+reviews UI, CORS origin, https notes"
git push origin infra-y-manifiestos
```

## 1. Reconstruir y publicar SOLO user-service (su imagen cambió)

Usa un TAG NUEVO (no reutilices 3dd6e9a con contenido distinto):

```bash
export NEWTAG=auth2
aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

docker build -f services/user-service/Dockerfile \
  -t "${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/bookstore/user-service:${NEWTAG}" .
docker push "${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/bookstore/user-service:${NEWTAG}"
```

Actualiza el tag en el manifiesto de user-service:

```bash
sed -i "s#bookstore/user-service:[^\"]*#bookstore/user-service:${NEWTAG}#" k8s/21-user-service.yaml
```

> Las otras cinco imágenes NO cambiaron: siguen en :3dd6e9a.

## 2. Redesplegar la infraestructura (el Lab se reinició: todo se borró)

Reproduce las fases ya documentadas (VPC, RDS, EKS, servicios). Si la VPC/RDS
siguen existiendo, salta a crear el cluster. Orden resumido:

```bash
# Cluster
eksctl create cluster -f k8s/eksctl-cluster.yaml
aws eks update-kubeconfig --region "$AWS_REGION" --name "$CLUSTER"

# Namespace + config + secrets (ver k8s/README-secrets.md para los secrets)
kubectl apply -f k8s/00-namespace.yaml
kubectl apply -f k8s/10-shared-config.yaml
# ... crear secrets bookstore-auth, bookstore-db, bookstore-rds-admin ...

# Autorizar el SG del cluster en RDS (si RDS se recreó, ajustar RDS_SG)
# Bootstrap de RDS
kubectl apply -f k8s/15-db-bootstrap-job.yaml
kubectl logs -f job/db-bootstrap -n "$NAMESPACE"

# Servicios + gateway
kubectl apply -f k8s/20-catalog-service.yaml -f k8s/21-user-service.yaml \
  -f k8s/22-order-service.yaml -f k8s/23-cart-service.yaml \
  -f k8s/24-wishlist-service.yaml -f k8s/25-review-service.yaml
kubectl apply -f k8s/41-api-gateway-lb.yaml

# URL pública del gateway (HTTP)
export API_LB=$(kubectl get svc api-gateway -n "$NAMESPACE" \
  -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
echo "Backend (HTTP): http://$API_LB"
```

## 3. Exponer el backend por HTTPS con un Cloudflare Quick Tunnel

El SPA es https; el LB es http -> el navegador bloquea "mixed content". Un Quick
Tunnel da una URL HTTPS temporal que apunta al LB, sin dominio ni cuenta.

Instalar cloudflared (una vez, en WSL):

```bash
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o cloudflared
chmod +x cloudflared && sudo mv cloudflared /usr/local/bin/
cloudflared --version
```

Arrancar el túnel hacia el LoadBalancer (dejar corriendo):

```bash
cloudflared tunnel --url "http://$API_LB"
# Imprime: https://<palabras-aleatorias>.trycloudflare.com  <- esta es la API HTTPS
```

Resultado: `https://<...>.trycloudflare.com` -> (HTTPS) -> tunnel -> (HTTP) -> LB
-> gateway -> microservicios.

> El Quick Tunnel es efímero: si cierras el proceso o apagas la máquina, la URL
> muere. La URL cambia en cada arranque; por eso el frontend la lee en RUNTIME
> (paso 4), no en build-time, para no tener que reconstruir cada vez.

## 4. Apuntar el frontend al túnel SIN reconstruir (runtime config)

El SPA lee la URL del backend de `/runtime-config.js` (servido como estático, no
compilado). Para cambiar de backend solo editas ese archivo y lo redeploy, sin
`npm run build`.

Edita `frontend/public/runtime-config.js` con la URL del Quick Tunnel:

```js
window.__BOOKSTORE_CONFIG__ = {
  apiBaseUrl: "https://<palabras-aleatorias>.trycloudflare.com",
};
```

Primer deploy del frontend (build una sola vez; las variables VITE solo fijan
el fallback y el prefijo):

```bash
cd frontend
export VITE_API_BASE_URL=/          # fallback; el runtime-config tiene prioridad
export VITE_API_PREFIX=/api
export VITE_CURRENCY_LOCALE=es-CO
export VITE_CURRENCY_CODE=COP
npm ci
npm run build
npx wrangler pages deploy dist --project-name bookstore-eafit
```

En arranques posteriores del Lab, cuando el túnel cambie de URL: edita
`public/runtime-config.js` (o el `runtime-config.js` ya desplegado) y vuelve a
subir solo ese archivo. No hace falta reconstruir el bundle.

## 5. Ajustar CORS al origen real (ya está, verificar)

`k8s/10-shared-config.yaml` tiene `CORS_ORIGINS: https://bookstore-eafit.pages.dev`.
Si el dominio de Pages difiere, actualízalo y reaplica:

```bash
kubectl apply -f k8s/10-shared-config.yaml
kubectl rollout restart deployment -n "$NAMESPACE"
```

## 6. Verificación end-to-end en el navegador

1. Abre `https://bookstore-eafit.pages.dev`.
2. DevTools > Network: las llamadas van a `https://api...` (sin warning de mixed content).
3. Login con `synthetic.customer.0001@bookstore.test` -> entra (Bearer token en localStorage).
4. Catálogo con portadas placeholder.
5. Página de libro: deja una reseña (aparece con tu nombre).
6. Botón corazón: agrega a wishlist; revísala en /wishlist.
7. Carrito + compra -> 201 y baja el stock.
