#!/usr/bin/env bash
# Gera infra/.env com senhas e chaves fortes. Rode uma vez, no host do deploy.
#
#   ./infra/gen-secrets.sh bealegend.exemplo.com
#
# O .env resultante já está no .gitignore — nunca o versione.
set -euo pipefail

DOMAIN="${1:-localhost}"
DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$DIR/.." && pwd)"
ENV_FILE="$DIR/.env"
VAPID_SCRIPT="$ROOT/apps/api/scripts/gen_vapid.py"

if [ -f "$ENV_FILE" ]; then
  echo "ERRO: $ENV_FILE já existe. Apague-o antes se quiser regenerar." >&2
  echo "Trocar JWT_SECRET desloga todo mundo; trocar a senha do banco exige" >&2
  echo "ALTER ROLE no Postgres." >&2
  exit 1
fi

rand() { openssl rand -base64 36 | tr -d '\n/+=' | cut -c1-40; }

# Chaves VAPID para Web Push (fase 6). Usa o Python do host se ele já tiver
# `cryptography`; senão, um container descartável.
if python3 -c 'import cryptography' >/dev/null 2>&1; then
  VAPID_JSON="$(python3 "$VAPID_SCRIPT")"
else
  VAPID_JSON="$(docker run --rm -v "$VAPID_SCRIPT:/gen.py:ro" python:3.12-slim \
    sh -c 'pip install --quiet cryptography && python /gen.py')"
fi

read_key() { printf '%s' "$VAPID_JSON" | sed -E "s/.*\"$1\": *\"([^\"]+)\".*/\1/"; }

umask 077
cat > "$ENV_FILE" <<ENVEOF
DOMAIN=$DOMAIN
PUBLIC_ORIGIN=https://$DOMAIN

POSTGRES_USER=bealegend
POSTGRES_PASSWORD=$(rand)
POSTGRES_DB=bealegend
APP_DB_PASSWORD=$(rand)

JWT_SECRET=$(rand)

VAPID_PUBLIC_KEY=$(read_key public)
VAPID_PRIVATE_KEY=$(read_key private)
VAPID_SUBJECT=mailto:admin@$DOMAIN
ENVEOF

chmod 600 "$ENV_FILE"
echo "Gerado $ENV_FILE (modo 600)."
echo
echo "Guarde uma cópia num gerenciador de senhas:"
echo "  · perder JWT_SECRET desloga todo mundo"
echo "  · perder APP_DB_PASSWORD exige ALTER ROLE no Postgres"
