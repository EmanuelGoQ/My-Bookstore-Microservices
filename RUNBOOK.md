# RUNBOOK — Desplegar BookStore de cero en AWS Academy + frontend en Cloudflare

Guía única y reproducible para levantar TODO el sistema desde un Lab recién
encendido. Incorpora los fixes de los problemas reales que ya encontramos
(security groups, contraseña de RDS, nodos que el Lab recicla).

Arquitectura: 6 microservicios Node.js en EKS (catalog, user, order, cart,
wishlist, review) + gateway Nginx, PostgreSQL en RDS (6 bases), imágenes en ECR,
clickstream a S3 vía Fluent Bit, API expuesta por HTTPS con Cloudflare Tunnel,
frontend React en Cloudflare Pages.

Repo: https://github.com/EmanuelGoQ/My-Bookstore-Microservices  (rama `main`)

---

## 0. Requisitos (una vez por máquina, en WSL)

```bash
# AWS CLI, kubectl, eksctl, docker, node, cloudflared
aws --version && kubectl version --client && eksctl version && docker --version && node --version
# cloudflared:
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o cloudflared
chmod +x cloudflared && sudo mv cloudflared /usr/local/bin/ && cloudflared --version
```

Clona el repo y entra:
```bash
git clone https://github.com/EmanuelGoQ/My-Bookstore-Microservices.git
cd My-Bookstore-Microservices
git checkout main && git pull
chmod +x scripts/*.sh
```

---

## 1. Encender el Lab y cargar credenciales

Inicia el Learner Lab (botón verde). Copia las credenciales temporales de
"AWS Details" a `~/.aws/credentials`. Verifica:

```bash
aws sts get-caller-identity          # debe devolver la cuenta 905418379975
export AWS_REGION=us-east-1 CLUSTER=bookstore-eks NAMESPACE=bookstore
```

---

## 2. Red + RDS (idempotente)

```bash
bash scripts/infra-up.sh
source ~/bookstore-env.sh
```

- Si la VPC/RDS SOBREVIVIERON de una sesión anterior, el script los reutiliza.
- IMPORTANTE (RDS reutilizado): el script no conoce la contraseña maestra vieja.
  Tras ejecutarlo, RESETÉALA a una conocida para alinear todo:

```bash
export RDS_MASTER_PW=$(openssl rand -hex 16)
aws rds modify-db-instance --db-instance-identifier bookstore-postgres \
  --master-user-password "$RDS_MASTER_PW" --apply-immediately --region "$AWS_REGION"
aws rds wait db-instance-available --db-instance-identifier bookstore-postgres --region "$AWS_REGION"
sed -i '/^export RDS_MASTER_PW=/d' ~/bookstore-env.sh
echo "export RDS_MASTER_PW=$RDS_MASTER_PW" >> ~/bookstore-env.sh
source ~/bookstore-env.sh
```

---

## 3. Cluster EKS

Si NO existe, créalo (~20 min):
```bash
eksctl create cluster -f k8s/eksctl-cluster.yaml
```
Si YA existe (sobrevivió), solo conecta:
```bash
aws eks update-kubeconfig --region "$AWS_REGION" --name "$CLUSTER"
```

### 3.1 FIX nodos reciclados por el Lab (MUY COMÚN)

Si `kubectl get nodes` muestra `NotReady`, `SchedulingDisabled`, o "No resources
found" (el Lab reinició las instancias), recrea el node group:

```bash
kubectl get nodes
# Si no hay nodos Ready:
eksctl delete nodegroup --cluster "$CLUSTER" --name bookstore-nodes --region "$AWS_REGION" --wait
eksctl create nodegroup -f k8s/eksctl-cluster.yaml
kubectl get nodes          # espera 2 nodos Ready
```

Si hubiera node groups duplicados (bookstore-nodes y bookstore-nodes-v2),
bórralos todos y crea uno limpio con el comando de arriba.

---

## 4. Secrets

```bash
bash scripts/secrets-up.sh
```

---

## 5. Desplegar backend (config + bootstrap + servicios + gateway + fluent-bit)

```bash
bash scripts/deploy.sh
```

Al final imprime la URL del LoadBalancer (`http://...elb.amazonaws.com`) y la
guarda como `API_LB` en `~/bookstore-env.sh`.

### 5.1 Si el bootstrap falla con "password authentication failed"

La contraseña del Secret no coincide con RDS. Repite el reset del paso 2.1,
recrea el secret y relanza:
```bash
kubectl delete secret bookstore-rds-admin -n bookstore
kubectl create secret generic bookstore-rds-admin -n bookstore \
  --from-literal=RDS_MASTER_USER=bookstore_admin \
  --from-literal=RDS_MASTER_PASSWORD="$RDS_MASTER_PW"
kubectl delete job db-bootstrap -n bookstore --ignore-not-found
bash scripts/deploy.sh
```

### 5.2 Si el bootstrap falla con "connection timed out"

El SG del cluster no está autorizado en RDS. `deploy.sh` ya lo intenta, pero
verifícalo:
```bash
CLUSTER_SG=$(aws eks describe-cluster --name "$CLUSTER" --region "$AWS_REGION" \
  --query 'cluster.resourcesVpcConfig.clusterSecurityGroupId' --output text)
aws ec2 authorize-security-group-ingress --group-id "$RDS_SG" \
  --protocol tcp --port 5432 --source-group "$CLUSTER_SG" --region "$AWS_REGION" 2>/dev/null || true
```

---

## 6. Verificar el backend (antes de exponerlo)

```bash
source ~/bookstore-env.sh
kubectl get pods -n bookstore          # todos Running 1/1
curl -s "http://$API_LB/api/books?limit=2" | head -c 200; echo
curl -s -X POST "http://$API_LB/api/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"synthetic.customer.0001@bookstore.test"}' | head -c 200; echo
```
El login debe devolver un `"token"`. Si sí, el backend está listo.

---

## 7. Exponer el backend por HTTPS (Cloudflare Quick Tunnel)

En una terminal que quede ABIERTA todo el tiempo de la demo:
```bash
source ~/bookstore-env.sh
cloudflared tunnel --url "http://$API_LB"
```
Copia la URL `https://<...>.trycloudflare.com`. Verifícala (otra terminal):
```bash
curl -s "https://<...>.trycloudflare.com/api/books?limit=2" | head -c 200; echo
```
Debe devolver el JSON de libros. Si da 502, el backend no está sirviendo
(revisa el paso 3.1: nodos).

---

## 8. Frontend (Cloudflare Pages)

1. Pon la URL del túnel en `frontend/public/runtime-config.js`:
   ```js
   window.__BOOKSTORE_CONFIG__ = { apiBaseUrl: "https://<...>.trycloudflare.com" };
   ```
2. Deploy:
   ```bash
   cd frontend
   export VITE_API_BASE_URL=/ VITE_API_PREFIX=/api VITE_CURRENCY_LOCALE=es-CO VITE_CURRENCY_CODE=COP
   npm ci && npm run build
   npx wrangler pages deploy dist --project-name bookstore-eafit
   ```
   O, si Pages está conectado al repo: commitea `runtime-config.js` y haz push.

3. CORS: el backend permite `https://bookstore-eafit.pages.dev`. Si el deploy
   usa otro dominio (p. ej. un preview), avisa para añadirlo en
   `k8s/10-shared-config.yaml` (`CORS_ORIGINS`) y `kubectl rollout restart deployment -n bookstore`.

---

## 9. Probar en el navegador

`https://bookstore-eafit.pages.dev` → login (`synthetic.customer.0001@bookstore.test`),
catálogo, reseña en un libro, wishlist (corazón), carrito y compra (201 + baja stock).
En DevTools > Network, las llamadas van a `https://...trycloudflare.com` sin mixed content.

---

## Reglas de oro para la demo

- El **túnel y el Lab deben estar encendidos** durante toda la prueba. Si se
  apagan, el frontend deja de funcionar (no es culpa del frontend).
- Cada reinicio del Lab suele **reciclar los nodos** (paso 3.1) y puede
  **desalinear la contraseña de RDS** (paso 2.1). Son los dos fixes más
  frecuentes.
- La **URL del túnel cambia** en cada arranque: actualiza `runtime-config.js` y
  redepliega el frontend (paso 8).

## Apagado (para no gastar saldo)

Ver `k8s/DEPLOYMENT-AWS.md` (borrar primero NAT Gateway y LoadBalancer).
