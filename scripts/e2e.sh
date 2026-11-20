#!/usr/bin/env bash
# Сквозной E2E-тест офлайн-сценария на отдельной тестовой БД (dolce_learn_test).
# Поднимает backend :8001 и PWA-сборку :4175, запускает Playwright (Chromium) и всё останавливает.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="$ROOT/.tools/node/bin:$PATH"
export PLAYWRIGHT_BROWSERS_PATH="$ROOT/.tools/ms-playwright"
TEST_DB="postgresql+psycopg://dolce:dolce_dev_password@127.0.0.1:5433/dolce_learn_test"
STORAGE="$(mktemp -d)"
cd "$ROOT/backend"
.venv/bin/python - <<PY
from sqlalchemy import create_engine, text
e = create_engine("$TEST_DB")
with e.begin() as c:
    c.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public"))
PY
DATABASE_URL="$TEST_DB" .venv/bin/alembic upgrade head >/dev/null
DATABASE_URL="$TEST_DB" STORAGE_DIR="$STORAGE" .venv/bin/python -m app.seed
DATABASE_URL="$TEST_DB" STORAGE_DIR="$STORAGE" .venv/bin/uvicorn app.main:app --port 8001 --log-level warning &
BACK=$!
cd "$ROOT/frontend"
[ -d dist ] || npx vite build >/dev/null
VITE_API_PROXY=http://127.0.0.1:8001 npx vite preview --port 4175 --strictPort >/dev/null &
FRONT=$!
trap 'kill $BACK $FRONT 2>/dev/null; rm -rf "$STORAGE"' EXIT
for i in $(seq 1 40); do curl -sf http://127.0.0.1:8001/api/health >/dev/null && curl -sf http://127.0.0.1:4175/ >/dev/null && break; sleep 0.5; done
E2E_BASE=http://localhost:4175 npx playwright test "$@"
