#!/usr/bin/env bash
# pg_dump diario para um volume externo. Instale no cron do host:
#   0 3 * * * /opt/bealegend/infra/backup.sh >> /var/log/bealegend-backup.log 2>&1
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/mnt/backup/bealegend}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
COMPOSE_DIR="$(cd "$(dirname "$0")" && pwd)"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

mkdir -p "$BACKUP_DIR"

docker compose -f "$COMPOSE_DIR/docker-compose.yml" exec -T db \
  pg_dump -U "${POSTGRES_USER:-bealegend}" -d "${POSTGRES_DB:-bealegend}" --format=custom \
  | gzip > "$BACKUP_DIR/bealegend-$STAMP.dump.gz"

# Um dump que nao restaura nao e backup: confira o tamanho minimo.
SIZE=$(stat -c%s "$BACKUP_DIR/bealegend-$STAMP.dump.gz")
if [ "$SIZE" -lt 1024 ]; then
  echo "ERRO: dump suspeito de $SIZE bytes" >&2
  exit 1
fi

find "$BACKUP_DIR" -name 'bealegend-*.dump.gz' -mtime "+$RETENTION_DAYS" -delete
echo "ok $STAMP ($SIZE bytes)"
