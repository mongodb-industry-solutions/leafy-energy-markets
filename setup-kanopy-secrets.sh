#!/usr/bin/env bash
# setup-kanopy-secrets.sh
# Reads secrets from deploy/.env and loads them into the Kanopy secret group
# "leafy-energy-markets-secrets" for the current kubectl context.
#
# Usage (after kub_login && kub_staging or kub_prod):
#   bash setup-kanopy-secrets.sh

set -euo pipefail

ENV_FILE="$(dirname "$0")/deploy/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE not found. Copy deploy/env.example → deploy/.env and fill in values."
  exit 1
fi

# Source the .env file — export every KEY=value into the shell
set -o allexport
# shellcheck disable=SC1090
source "$ENV_FILE"
set +o allexport

SECRET_GROUP="leafy-energy-markets-secrets"
NAMESPACE="industrysolutions"

echo "Loading secrets into group: $SECRET_GROUP (namespace: $NAMESPACE)"
echo "Current context: $(kubectl config current-context)"
echo ""

# ── Required ───────────────────────────────────────────────────────────────────
if [[ -z "${MONGO_URI:-}" ]]; then
  echo "ERROR: MONGO_URI is not set in deploy/.env"
  exit 1
fi
helm ksec set "$SECRET_GROUP" "MONGO_URI=$MONGO_URI" -n "$NAMESPACE"
echo "[OK] MONGO_URI"

# ── LLM provider (at least one required) ──────────────────────────────────────
if [[ -n "${ANTHROPIC_API_KEY:-}" ]]; then
  helm ksec set "$SECRET_GROUP" "ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY" -n "$NAMESPACE"
  echo "[OK] ANTHROPIC_API_KEY"
elif [[ -n "${AZURE_FOUNDRY_API_KEY:-}" && -n "${AZURE_FOUNDRY_ENDPOINT:-}" ]]; then
  helm ksec set "$SECRET_GROUP" "AZURE_FOUNDRY_API_KEY=$AZURE_FOUNDRY_API_KEY" -n "$NAMESPACE"
  helm ksec set "$SECRET_GROUP" "AZURE_FOUNDRY_ENDPOINT=$AZURE_FOUNDRY_ENDPOINT" -n "$NAMESPACE"
  echo "[OK] AZURE_FOUNDRY_API_KEY + AZURE_FOUNDRY_ENDPOINT"
else
  echo "WARNING: No LLM key found (ANTHROPIC_API_KEY or AZURE_FOUNDRY_*). EnerLeafy AI will not work."
fi

# ── Optional ───────────────────────────────────────────────────────────────────
if [[ -n "${VOYAGE_API_KEY:-}" ]]; then
  helm ksec set "$SECRET_GROUP" "VOYAGE_API_KEY=$VOYAGE_API_KEY" -n "$NAMESPACE"
  echo "[OK] VOYAGE_API_KEY"
else
  echo "[SKIP] VOYAGE_API_KEY not set — hash-fallback embeddings will be used"
fi

echo ""
echo "Done. Verify with:"
echo "  helm ksec list $SECRET_GROUP -n $NAMESPACE"
