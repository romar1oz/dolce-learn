#!/usr/bin/env bash
# Все автотесты: backend (pytest), frontend (vitest, tsc), E2E офлайн-сценарий (Playwright).
#   ./scripts/test.sh          — всё
#   ./scripts/test.sh --fast   — без E2E
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="$ROOT/.tools/node/bin:$PATH"
echo "== backend: pytest"; (cd "$ROOT/backend" && .venv/bin/python -m pytest -q -p no:warnings)
echo "== frontend: typecheck";  (cd "$ROOT/frontend" && npx tsc -b --noEmit)
echo "== frontend: vitest";     (cd "$ROOT/frontend" && npx vitest run)
if [ "${1:-}" != "--fast" ]; then
  echo "== frontend: build";    (cd "$ROOT/frontend" && npx vite build >/dev/null)
  echo "== e2e: offline scenario (Chromium)"; "$ROOT/scripts/e2e.sh"
fi
echo "Все тесты пройдены."
