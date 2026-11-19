#!/usr/bin/env bash
#
# deploy.sh — Despliega BookStore en el cluster EKS ya existente.
# Asume: cluster creado (eksctl), kubeconfig activo, ~/bookstore-env.sh cargado,
# y los Secrets creados (scripts/secrets-up.sh).
#
# Pasos: pone el endpoint RDS en el ConfigMap, autoriza el SG del cluster en RDS,
# corre el Job de bootstrap, aplica servicios + gateway + Fluent Bit, e imprime
# la URL pública del backend.
set -Eeuo pipefail

: "${NAMESPACE:?source ~/bookstore-env.sh first}"
: "${RDS_ENDPOINT:?RDS_ENDPOINT missing}"
: "${RDS_SG:?RDS_SG missing}"
: "${CLUSTER:?CLUSTER missing}"
: "${AWS_REGION:?AWS_REGION missing}"

cd "$(dirname "$0")/.."

log() { printf '\n[deploy] %s\n' "$1"; }

# 1) Put the real RDS endpoint into the ConfigMap (in place, not committed).
log "Setting RDS endpoint in ConfigMap"
sed -i "s#RDS_ENDPOINT_PLACEHOLDER#${RDS_ENDPOINT}#" k8s/10-shared-config.yaml 2>/dev/null || true
# If it was already replaced in git, force the current endpoint:
sed -i -E "s#(DB_HOST: \").*(\")#\1${RDS_ENDPOINT}\2#" k8s/10-shared-config.yaml

kubectl apply -f k8s/00-namespace.yaml
kubectl apply -f k8s/10-shared-config.yaml

# 2) Allow the EKS cluster security group to reach RDS on 5432.
CLUSTER_SG="$(aws eks describe-cluster --name "$CLUSTER" --region "$AWS_REGION" \
  --query 'cluster.resourcesVpcConfig.clusterSecurityGroupId' --output text)"
log "Authorizing cluster SG $CLUSTER_SG on RDS_SG $RDS_SG"
aws ec2 authorize-security-group-ingress --group-id "$RDS_SG" --protocol tcp --port 5432 \
  --source-group "$CLUSTER_SG" --region "$AWS_REGION" 2>/dev/null || true

# 3) Database bootstrap (six DBs + roles + schemas + seeds).
log "Running DB bootstrap job"
kubectl delete job db-bootstrap -n "$NAMESPACE" --ignore-not-found
kubectl apply -f k8s/15-db-bootstrap-job.yaml
kubectl wait --for=condition=complete job/db-bootstrap -n "$NAMESPACE" --timeout=300s \
  || { log "Bootstrap no completó; revisa: kubectl logs job/db-bootstrap -n $NAMESPACE"; exit 1; }

# 4) Services + gateway.
log "Applying services and gateway"
kubectl apply -f k8s/20-catalog-service.yaml -f k8s/21-user-service.yaml \
  -f k8s/22-order-service.yaml -f k8s/23-cart-service.yaml \
  -f k8s/24-wishlist-service.yaml -f k8s/25-review-service.yaml \
  -f k8s/41-api-gateway-lb.yaml

for d in catalog-service user-service order-service cart-service wishlist-service review-service api-gateway; do
  kubectl rollout status deployment/"$d" -n "$NAMESPACE" --timeout=180s
done

# 5) Fluent Bit (clickstream -> S3).
log "Applying Fluent Bit"
kubectl apply -f k8s/50-fluent-bit-rbac.yaml -f k8s/51-fluent-bit-config.yaml -f k8s/52-fluent-bit-daemonset.yaml || true

# 6) Public backend URL.
log "Waiting for the LoadBalancer hostname..."
for i in $(seq 1 30); do
  API_LB="$(kubectl get svc api-gateway -n "$NAMESPACE" -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null || true)"
  [[ -n "$API_LB" ]] && break
  sleep 10
done

echo
echo "=================================================================="
echo " Backend (HTTP LoadBalancer): http://$API_LB"
echo " Siguiente: cloudflared tunnel --url http://$API_LB"
echo " Luego pon la URL https del túnel en frontend/public/runtime-config.js"
echo "=================================================================="
grep -q RDS_ENDPOINT "$HOME/bookstore-env.sh" 2>/dev/null || echo "export RDS_ENDPOINT=$RDS_ENDPOINT" >> "$HOME/bookstore-env.sh"
echo "export API_LB=$API_LB" >> "$HOME/bookstore-env.sh"
