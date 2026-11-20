#!/usr/bin/env bash
# Локальный запуск без Docker: PostgreSQL (порт 5433) + миграции + seed + backend :8000 + frontend.
#   ./scripts/dev.sh          — PWA-сборка (vite preview, Service Worker включён)  → http://localhost:4173
#   ./scripts/dev.sh --hot    — режим разработки с hot reload (Service Worker выключен) → http://localhost:5173
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="$ROOT/.tools/node/bin:$PATH"
PG="$ROOT/.tools/pgsql/bin"
DATA="$ROOT/.data/pg"

if [ ! -x "$PG/postgres" ] || [ ! -x "$ROOT/.tools/node/bin/node" ]; then
  echo "Нет переносимых Node/PostgreSQL в .tools — выполните ./scripts/setup.sh"; exit 1
fi
[ -f "$ROOT/.env" ] || cp "$ROOT/.env.example" "$ROOT/.env"

if [ ! -d "$DATA" ]; then
  "$PG/initdb" -D "$DATA" -U postgres --auth=trust -E UTF8 --locale=C >/dev/null
  NEWDB=1
fi
if ! "$PG/pg_ctl" -D "$DATA" status >/dev/null 2>&1; then
  "$PG/pg_ctl" -D "$DATA" -o "-p 5433 -k /tmp" -l "$ROOT/.data/pg.log" start >/dev/null
  sleep 2
fi
cd "$ROOT/backend"
if [ "${NEWDB:-0}" = 1 ]; then
  .venv/bin/python - <<'PY'
import psycopg
c = psycopg.connect("host=127.0.0.1 port=5433 user=postgres dbname=postgres", autocommit=True)
c.execute("CREATE ROLE dolce LOGIN PASSWORD 'dolce_dev_password'")
c.execute("CREATE DATABASE dolce_learn OWNER dolce")
c.execute("CREATE DATABASE dolce_learn_test OWNER dolce")
PY
fi
.venv/bin/alembic upgrade head
.venv/bin/python -m app.seed
.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 &
BACK=$!
trap 'kill $BACK 2>/dev/null' EXIT
cd "$ROOT/frontend"
if [ "${1:-}" = "--hot" ]; then
  npx vite --port 5173
else
  npx vite build && npx vite preview --port 4173
fi
