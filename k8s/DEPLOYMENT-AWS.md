# Despliegue en AWS Academy — Inventario y operación

Despliegue del commit base `3dd6e9a` (rama `infra-y-manifiestos`) de
My-Bookstore-Microservices en AWS Academy Learner Lab: seis microservicios
Node.js en EKS, PostgreSQL en RDS, imágenes en ECR, API pública vía Service
LoadBalancer y clickstream a S3 vía Fluent Bit.

## Decisiones forzadas por AWS Academy

- **Sin roles IAM nuevos**: se reutiliza `LabRole` para el cluster, los nodos y
  (vía la cadena de credenciales del nodo) Fluent Bit.
- **Sin OIDC/IRSA**: Academy bloquea `iam:CreateOpenIDConnectProvider`. Por eso:
  - el cluster se crea con `withOIDC: false`;
  - NO se usa el AWS Load Balancer Controller ni el Ingress ALB;
  - la API se expone con un **Service `type: LoadBalancer`** (Classic LB) sobre
    un gateway Nginx interno que enruta `/api/<dominio>` a cada servicio;
  - Fluent Bit escribe a S3 con las credenciales del nodo (`LabRole`), sin IRSA.

## Inventario de recursos (región us-east-1, cuenta 905418379975)

| Recurso | Identificador |
|---|---|
| VPC | `vpc-08ff704e7e0a404f1` (10.0.0.0/16) |
| Subredes públicas | `subnet-0e7f164785720d885` (1a), `subnet-07bd39009d1cebfe8` (1b) |
| Subredes privadas | `subnet-0023ada8a4dfee97c` (1a), `subnet-007f0c9db6b930815` (1b) |
| Internet Gateway | `igw-0b261c91891f27748` |
| NAT Gateway | `nat-01c66636ed5ecd758` (+ EIP `eipalloc-0f20ce5a042d2c8fd`) |
| SG RDS | `sg-0e25f8d86828c8cbc` (5432 solo desde los SG de nodos) |
| SG nodos (manual) | `sg-042c655e775748b17` |
| SG cluster EKS | `sg-0944d21d538f10719` (autorizado en el SG de RDS) |
| RDS PostgreSQL | `bookstore-postgres` (16.15, db.t3.micro, privada) |
| RDS endpoint | `bookstore-postgres.cr4ikmasytby.us-east-1.rds.amazonaws.com` |
| Cluster EKS | `bookstore-eks` (1.31), node group `bookstore-nodes` (2 x t3.medium) |
| ECR | `bookstore/{catalog,user,order,cart,wishlist,review}-service:3dd6e9a` |
| Bucket clickstream | `bookstore-clickstream-905418379975` |
| API pública (CLB) | el hostname del Service `api-gateway` (`kubectl get svc api-gateway -n bookstore`) |

## Recursos con costo por hora (vigilar / apagar)

- **NAT Gateway** (`nat-...`) — el más caro por hora. Borrar PRIMERO al terminar.
- **Classic LB** del Service `api-gateway`.
- **EKS control plane** + 2 nodos EC2 `t3.medium`.
- **RDS** `db.t3.micro`.
- **EIP** del NAT (cobra si queda sin asociar).

## Orden de apagado (respetar dependencias)

```bash
source ~/bookstore-env.sh

# 1. Borrar el LoadBalancer (borrando el Service se elimina el CLB en AWS).
kubectl delete -f k8s/41-api-gateway-lb.yaml

# 2. Borrar el resto de cargas del cluster (opcional, el delete cluster las elimina).
kubectl delete namespace bookstore logging

# 3. Borrar el cluster EKS (control plane + node group).
eksctl delete cluster --region "$AWS_REGION" --name "$CLUSTER" --wait

# 4. Borrar RDS (sin snapshot final para no dejar artefactos facturables).
aws rds delete-db-instance --db-instance-identifier bookstore-postgres \
  --skip-final-snapshot --delete-automated-backups --region "$AWS_REGION"
aws rds wait db-instance-deleted --db-instance-identifier bookstore-postgres --region "$AWS_REGION"

# 5. Borrar el NAT Gateway y liberar la EIP.
aws ec2 delete-nat-gateway --nat-gateway-id "$NAT_ID" --region "$AWS_REGION"
aws ec2 wait nat-gateway-deleted --nat-gateway-ids "$NAT_ID" --region "$AWS_REGION"
aws ec2 release-address --allocation-id "$EIP_ALLOC" --region "$AWS_REGION"

# 6. (Opcional) Vaciar y borrar el bucket de clickstream si no se conserva.
aws s3 rm "s3://$CLICKSTREAM_BUCKET" --recursive
aws s3api delete-bucket --bucket "$CLICKSTREAM_BUCKET" --region "$AWS_REGION"

# 7. (Opcional) Borrar IGW, subredes, route tables y la VPC si se creó a mano.
#    Hacerlo solo tras el delete cluster, que libera las ENIs.
```

> Las imágenes en ECR y el bucket S3 no cobran por hora de forma significativa;
> consérvalos si necesitas re-desplegar. El NAT, el LB, EKS y RDS sí cobran por
> hora: bórralos al terminar cada sesión del Lab.
