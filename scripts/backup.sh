#!/usr/bin/env bash
# Резервная копия: дамп PostgreSQL + архив загруженных файлов → backups/<дата>/
#   ./scripts/backup.sh            — Docker-развёртывание (docker compose)
#   ./scripts/backup.sh --local    — локальный запуск (backend/.venv + PostgreSQL :5433)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/backups/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$DEST"
if [ "${1:-}" = "--local" ]; then
  # pg_dump в переносимой сборке нет — используем системный, если установлен
  if command -v pg_dump >/dev/null; then
    pg_dump -h 127.0.0.1 -p 5433 -U dolce -Fc dolce_learn -f "$DEST/dolce_learn.dump"
  else
    echo "pg_dump не найден. Установите клиент PostgreSQL 17 (brew install libpq) или используйте Docker." >&2; exit 1
  fi
  tar czf "$DEST/storage.tar.gz" -C "$ROOT" storage
else
  docker compose -f "$ROOT/docker-compose.yml" exec -T db pg_dump -U dolce -Fc dolce_learn > "$DEST/dolce_learn.dump"
  docker compose -f "$ROOT/docker-compose.yml" exec -T backend tar czf - -C /data storage > "$DEST/storage.tar.gz"
fi
echo "Резервная копия: $DEST"
