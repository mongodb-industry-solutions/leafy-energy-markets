#!/usr/bin/env bash
# setup-drone-secrets.sh
# Extracts Kubernetes service account tokens and ECR credentials from the current
# cluster context and sets them as Drone CI secrets for leafy-energy-markets.
#
# Prerequisites:
#   - drone CLI installed (brew install drone or https://docs.drone.io/cli/install/)
#   - DRONE_SERVER and DRONE_TOKEN env vars set (from Drone UI → Account → Tokens)
#   - kubectl configured with access to both staging and prod clusters
#   - AWS credentials with ECR read/write on account 795250896452
#
# Usage:
#   export DRONE_SERVER=https://drone.corp.mongodb.com
#   export DRONE_TOKEN=<your-drone-personal-token>
#   export AWS_ACCESS_KEY_ID=<ecr-access-key>
#   export AWS_SECRET_ACCESS_KEY=<ecr-secret-key>
#   bash setup-drone-secrets.sh

set -euo pipefail

REPO="frankbaldi44/leafy-energy-markets"

# ── Validate prerequisites ─────────────────────────────────────────────────────
if ! command -v drone &>/dev/null; then
  echo "ERROR: drone CLI not found. Install with: brew install drone"
  exit 1
fi

if [[ -z "${DRONE_SERVER:-}" || -z "${DRONE_TOKEN:-}" ]]; then
  echo "ERROR: Set DRONE_SERVER and DRONE_TOKEN before running."
  exit 1
fi

if [[ -z "${AWS_ACCESS_KEY_ID:-}" || -z "${AWS_SECRET_ACCESS_KEY:-}" ]]; then
  echo "ERROR: Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY before running."
  exit 1
fi

echo "Setting Drone secrets for repo: $REPO"

# ── ECR credentials ────────────────────────────────────────────────────────────
drone secret add --repository "$REPO" \
  --name ecr_access_key \
  --data "$AWS_ACCESS_KEY_ID" \
  --allow-pull-request=false

drone secret add --repository "$REPO" \
  --name ecr_secret_key \
  --data "$AWS_SECRET_ACCESS_KEY" \
  --allow-pull-request=false

echo "[OK] ECR credentials set"

# ── Staging Kubernetes token ───────────────────────────────────────────────────
echo "Switching to staging cluster..."
kubectl config use-context api.staging.corp.mongodb.com
kubectl config set-context --current --namespace=industrysolutions

STAGING_SA_SECRET=$(kubectl get serviceaccount kanopy-staging-cicd-irsa \
  -n industrysolutions \
  -o jsonpath='{.secrets[0].name}' 2>/dev/null || echo "")

if [[ -z "$STAGING_SA_SECRET" ]]; then
  echo "WARNING: Could not find staging service account secret. Trying token from kubeconfig..."
  STAGING_TOKEN=$(kubectl config view --raw --minify \
    -o jsonpath='{.users[0].user.token}' 2>/dev/null || echo "")
else
  STAGING_TOKEN=$(kubectl get secret "$STAGING_SA_SECRET" \
    -n industrysolutions \
    -o jsonpath='{.data.token}' | base64 --decode)
fi

if [[ -z "$STAGING_TOKEN" ]]; then
  echo "ERROR: Could not extract staging Kubernetes token. Run 'kanopy-oidc kube login' first."
  exit 1
fi

drone secret add --repository "$REPO" \
  --name staging_kubernetes_token \
  --data "$STAGING_TOKEN" \
  --allow-pull-request=false

echo "[OK] Staging Kubernetes token set"

# ── Production Kubernetes token ────────────────────────────────────────────────
echo "Switching to production cluster..."
kubectl config use-context api.prod.corp.mongodb.com
kubectl config set-context --current --namespace=industrysolutions

PROD_SA_SECRET=$(kubectl get serviceaccount kanopy-prod-cicd-irsa \
  -n industrysolutions \
  -o jsonpath='{.secrets[0].name}' 2>/dev/null || echo "")

if [[ -z "$PROD_SA_SECRET" ]]; then
  echo "WARNING: Could not find prod service account secret. Trying token from kubeconfig..."
  PROD_TOKEN=$(kubectl config view --raw --minify \
    -o jsonpath='{.users[0].user.token}' 2>/dev/null || echo "")
else
  PROD_TOKEN=$(kubectl get secret "$PROD_SA_SECRET" \
    -n industrysolutions \
    -o jsonpath='{.data.token}' | base64 --decode)
fi

if [[ -z "$PROD_TOKEN" ]]; then
  echo "ERROR: Could not extract production Kubernetes token. Run 'kanopy-oidc kube login' first."
  exit 1
fi

drone secret add --repository "$REPO" \
  --name prod_kubernetes_token \
  --data "$PROD_TOKEN" \
  --allow-pull-request=false

echo "[OK] Production Kubernetes token set"

# ── Summary ────────────────────────────────────────────────────────────────────
echo ""
echo "All Drone secrets configured for $REPO:"
drone secret ls --repository "$REPO"

echo ""
echo "Next steps:"
echo "  1. Activate the repo in Drone UI: https://drone.corp.mongodb.com"
echo "  2. Set MongoDB Atlas + AI secrets via helm ksec:"
echo "       helm ksec set leafy-energy-markets-secrets MONGO_URI='<uri>' --namespace industrysolutions"
echo "       helm ksec set leafy-energy-markets-secrets ANTHROPIC_API_KEY='<key>' --namespace industrysolutions"
echo "       helm ksec set leafy-energy-markets-secrets VOYAGE_API_KEY='<key>' --namespace industrysolutions"
echo "  3. Push to staging branch to trigger first deployment:"
echo "       git push origin staging"
