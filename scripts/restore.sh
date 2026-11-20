#!/usr/bin/env bash
# Восстановление из backups/<дата>/ (Docker-развёртывание). ВНИМАНИЕ: перезаписывает текущие данные.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${1:?Укажите каталог резервной копии, например backups/20261120_120000}"
read -r -p "Текущая база и файлы будут заменены копией из $SRC. Продолжить? [yes/N] " ok
[ "$ok" = "yes" ] || exit 1
docker compose -f "$ROOT/docker-compose.yml" exec -T db pg_restore -U dolce -d dolce_learn --clean --if-exists < "$SRC/dolce_learn.dump"
docker compose -f "$ROOT/docker-compose.yml" exec -T backend sh -c 'rm -rf /data/storage/* && tar xzf - -C /data' < "$SRC/storage.tar.gz"
echo "Восстановлено."
