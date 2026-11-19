#!/usr/bin/env bash
#
# infra-up.sh — Crea (o reutiliza) la red y RDS para BookStore en AWS Academy.
#
# Idempotente: si un recurso ya existe (por nombre/tag), lo reutiliza en vez de
# duplicarlo. Guarda todos los IDs en ~/bookstore-env.sh para las demás fases.
#
# Uso:
#   export RDS_MASTER_PW=...      # opcional; si no, se genera uno
#   bash scripts/infra-up.sh
#
# Requisitos: credenciales del Learner Lab activas (aws sts get-caller-identity).
set -Eeuo pipefail

AWS_REGION="${AWS_REGION:-us-east-1}"
CLUSTER="${CLUSTER:-bookstore-eks}"
ENV_FILE="$HOME/bookstore-env.sh"

log() { printf '\n[infra-up] %s\n' "$1"; }

# tag_name <resource-id> <name>
tag_name() { aws ec2 create-tags --resources "$1" --tags Key=Name,Value="$2" --region "$AWS_REGION"; }

# find a resource id by Name tag, empty if none
find_by_name() {
  local type="$1" name="$2" query="$3"
  aws ec2 "describe-${type}" --filters "Name=tag:Name,Values=${name}" \
    --query "$query" --output text --region "$AWS_REGION" 2>/dev/null | grep -v '^None$' || true
}

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
log "Account $ACCOUNT_ID, region $AWS_REGION"

# ---------- VPC ----------
VPC_ID="$(find_by_name vpcs bookstore-vpc 'Vpcs[0].VpcId')"
if [[ -z "$VPC_ID" ]]; then
  log "Creating VPC"
  VPC_ID="$(aws ec2 create-vpc --cidr-block 10.0.0.0/16 --region "$AWS_REGION" --query 'Vpc.VpcId' --output text)"
  aws ec2 modify-vpc-attribute --vpc-id "$VPC_ID" --enable-dns-support --region "$AWS_REGION"
  aws ec2 modify-vpc-attribute --vpc-id "$VPC_ID" --enable-dns-hostnames --region "$AWS_REGION"
  tag_name "$VPC_ID" bookstore-vpc
else
  log "Reusing VPC $VPC_ID"
fi

# ---------- Subnets ----------
make_subnet() { # name cidr az
  local id; id="$(find_by_name subnets "$1" 'Subnets[0].SubnetId')"
  if [[ -z "$id" ]]; then
    id="$(aws ec2 create-subnet --vpc-id "$VPC_ID" --cidr-block "$2" \
      --availability-zone "$3" --region "$AWS_REGION" --query 'Subnet.SubnetId' --output text)"
    tag_name "$id" "$1"
  fi
  echo "$id"
}
PUB_SUBNET_1="$(make_subnet bookstore-public-1a 10.0.1.0/24 ${AWS_REGION}a)"
PUB_SUBNET_2="$(make_subnet bookstore-public-1b 10.0.2.0/24 ${AWS_REGION}b)"
PRIV_SUBNET_1="$(make_subnet bookstore-private-1a 10.0.11.0/24 ${AWS_REGION}a)"
PRIV_SUBNET_2="$(make_subnet bookstore-private-1b 10.0.12.0/24 ${AWS_REGION}b)"
aws ec2 modify-subnet-attribute --subnet-id "$PUB_SUBNET_1" --map-public-ip-on-launch --region "$AWS_REGION"
aws ec2 modify-subnet-attribute --subnet-id "$PUB_SUBNET_2" --map-public-ip-on-launch --region "$AWS_REGION"
log "Subnets: pub=$PUB_SUBNET_1,$PUB_SUBNET_2 priv=$PRIV_SUBNET_1,$PRIV_SUBNET_2"

# ---------- IGW ----------
IGW_ID="$(find_by_name internet-gateways bookstore-igw 'InternetGateways[0].InternetGatewayId')"
if [[ -z "$IGW_ID" ]]; then
  IGW_ID="$(aws ec2 create-internet-gateway --region "$AWS_REGION" --query 'InternetGateway.InternetGatewayId' --output text)"
  tag_name "$IGW_ID" bookstore-igw
fi
aws ec2 attach-internet-gateway --internet-gateway-id "$IGW_ID" --vpc-id "$VPC_ID" --region "$AWS_REGION" 2>/dev/null || true

# ---------- NAT + EIP ----------
NAT_ID="$(aws ec2 describe-nat-gateways --filter "Name=tag:Name,Values=bookstore-nat" "Name=state,Values=available,pending" \
  --query 'NatGateways[0].NatGatewayId' --output text --region "$AWS_REGION" 2>/dev/null | grep -v '^None$' || true)"
if [[ -z "$NAT_ID" ]]; then
  log "Allocating EIP + NAT (tarda ~2 min)"
  EIP_ALLOC="$(aws ec2 allocate-address --domain vpc --region "$AWS_REGION" --query 'AllocationId' --output text)"
  tag_name "$EIP_ALLOC" bookstore-nat-eip
  NAT_ID="$(aws ec2 create-nat-gateway --subnet-id "$PUB_SUBNET_1" --allocation-id "$EIP_ALLOC" \
    --region "$AWS_REGION" --query 'NatGateway.NatGatewayId' --output text)"
  tag_name "$NAT_ID" bookstore-nat
  aws ec2 wait nat-gateway-available --nat-gateway-ids "$NAT_ID" --region "$AWS_REGION"
else
  EIP_ALLOC="$(aws ec2 describe-addresses --filters "Name=tag:Name,Values=bookstore-nat-eip" \
    --query 'Addresses[0].AllocationId' --output text --region "$AWS_REGION" 2>/dev/null | grep -v '^None$' || true)"
  log "Reusing NAT $NAT_ID"
fi

# ---------- Route tables ----------
ensure_rtb() { # name
  local id; id="$(find_by_name route-tables "$1" 'RouteTables[0].RouteTableId')"
  if [[ -z "$id" ]]; then
    id="$(aws ec2 create-route-table --vpc-id "$VPC_ID" --region "$AWS_REGION" --query 'RouteTable.RouteTableId' --output text)"
    tag_name "$id" "$1"
  fi
  echo "$id"
}
PUB_RTB="$(ensure_rtb bookstore-public-rtb)"
PRIV_RTB="$(ensure_rtb bookstore-private-rtb)"
aws ec2 create-route --route-table-id "$PUB_RTB" --destination-cidr-block 0.0.0.0/0 --gateway-id "$IGW_ID" --region "$AWS_REGION" 2>/dev/null || true
aws ec2 create-route --route-table-id "$PRIV_RTB" --destination-cidr-block 0.0.0.0/0 --nat-gateway-id "$NAT_ID" --region "$AWS_REGION" 2>/dev/null || true
for s in "$PUB_SUBNET_1" "$PUB_SUBNET_2"; do aws ec2 associate-route-table --route-table-id "$PUB_RTB" --subnet-id "$s" --region "$AWS_REGION" 2>/dev/null || true; done
for s in "$PRIV_SUBNET_1" "$PRIV_SUBNET_2"; do aws ec2 associate-route-table --route-table-id "$PRIV_RTB" --subnet-id "$s" --region "$AWS_REGION" 2>/dev/null || true; done

# ---------- Subnet tags for EKS/ALB ----------
aws ec2 create-tags --resources "$PUB_SUBNET_1" "$PUB_SUBNET_2" --tags Key=kubernetes.io/role/elb,Value=1 --region "$AWS_REGION"
aws ec2 create-tags --resources "$PRIV_SUBNET_1" "$PRIV_SUBNET_2" --tags Key=kubernetes.io/role/internal-elb,Value=1 --region "$AWS_REGION"
aws ec2 create-tags --resources "$PUB_SUBNET_1" "$PUB_SUBNET_2" "$PRIV_SUBNET_1" "$PRIV_SUBNET_2" \
  --tags "Key=kubernetes.io/cluster/${CLUSTER},Value=shared" --region "$AWS_REGION"

# ---------- Security groups ----------
ensure_sg() { # name desc
  local id; id="$(aws ec2 describe-security-groups --filters "Name=group-name,Values=$1" "Name=vpc-id,Values=$VPC_ID" \
    --query 'SecurityGroups[0].GroupId' --output text --region "$AWS_REGION" 2>/dev/null | grep -v '^None$' || true)"
  if [[ -z "$id" ]]; then
    id="$(aws ec2 create-security-group --group-name "$1" --description "$2" --vpc-id "$VPC_ID" \
      --region "$AWS_REGION" --query 'GroupId' --output text)"
    tag_name "$id" "$1"
  fi
  echo "$id"
}
NODES_SG="$(ensure_sg bookstore-nodes-sg 'EKS worker nodes SG')"
RDS_SG="$(ensure_sg bookstore-rds-sg 'RDS PostgreSQL SG - only from EKS nodes')"
aws ec2 authorize-security-group-ingress --group-id "$RDS_SG" --protocol tcp --port 5432 \
  --source-group "$NODES_SG" --region "$AWS_REGION" 2>/dev/null || true

# ---------- RDS ----------
aws rds create-db-subnet-group --db-subnet-group-name bookstore-db-subnets \
  --db-subnet-group-description "BookStore private subnets" \
  --subnet-ids "$PRIV_SUBNET_1" "$PRIV_SUBNET_2" --region "$AWS_REGION" 2>/dev/null || true

RDS_STATUS="$(aws rds describe-db-instances --db-instance-identifier bookstore-postgres \
  --query 'DBInstances[0].DBInstanceStatus' --output text --region "$AWS_REGION" 2>/dev/null || true)"
if [[ -z "$RDS_STATUS" || "$RDS_STATUS" == "None" ]]; then
  : "${RDS_MASTER_PW:=$(openssl rand -hex 16)}"
  log "Creating RDS (tarda 5-10 min)"
  aws rds create-db-instance --db-instance-identifier bookstore-postgres \
    --engine postgres --engine-version 16.15 --db-instance-class db.t3.micro \
    --allocated-storage 20 --storage-type gp3 \
    --master-username bookstore_admin --master-user-password "$RDS_MASTER_PW" \
    --db-name postgres --vpc-security-group-ids "$RDS_SG" \
    --db-subnet-group-name bookstore-db-subnets \
    --no-publicly-accessible --no-multi-az --backup-retention-period 0 \
    --region "$AWS_REGION" >/dev/null
  aws rds wait db-instance-available --db-instance-identifier bookstore-postgres --region "$AWS_REGION"
else
  log "Reusing RDS (status=$RDS_STATUS); RDS_MASTER_PW debe venir de tu entorno previo"
  : "${RDS_MASTER_PW:=CHANGE_ME_reuse}"
fi
RDS_ENDPOINT="$(aws rds describe-db-instances --db-instance-identifier bookstore-postgres \
  --query 'DBInstances[0].Endpoint.Address' --output text --region "$AWS_REGION")"

# ---------- Persist ----------
cat > "$ENV_FILE" <<EOF
export AWS_REGION=$AWS_REGION
export CLUSTER=$CLUSTER
export NAMESPACE=bookstore
export ACCOUNT_ID=$ACCOUNT_ID
export VPC_ID=$VPC_ID
export PUB_SUBNET_1=$PUB_SUBNET_1
export PUB_SUBNET_2=$PUB_SUBNET_2
export PRIV_SUBNET_1=$PRIV_SUBNET_1
export PRIV_SUBNET_2=$PRIV_SUBNET_2
export IGW_ID=$IGW_ID
export NAT_ID=$NAT_ID
export EIP_ALLOC=${EIP_ALLOC:-}
export PUB_RTB=$PUB_RTB
export PRIV_RTB=$PRIV_RTB
export NODES_SG=$NODES_SG
export RDS_SG=$RDS_SG
export RDS_ENDPOINT=$RDS_ENDPOINT
export RDS_MASTER_PW=$RDS_MASTER_PW
export FRONT_ORIGIN=https://bookstore-eafit.pages.dev
EOF

log "Done. Variables saved to $ENV_FILE"
log "RDS_ENDPOINT=$RDS_ENDPOINT"
echo "source $ENV_FILE   # cárgalo antes de seguir"
