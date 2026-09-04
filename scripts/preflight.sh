#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONTENT_OS_PYTHON="${CONTENT_OS_PYTHON:-python3}"

"$CONTENT_OS_PYTHON" - <<'PY'
import sys

if sys.version_info < (3, 10):
    raise SystemExit("Content OS requires Python 3.10 or newer")
PY

echo "[1/5] Python compile"
"$CONTENT_OS_PYTHON" -m compileall -q "$ROOT/api" "$ROOT/publisher" "$ROOT/research"

echo "[2/5] Backend tests"
(cd "$ROOT/api" && PYTHONPATH=. "$CONTENT_OS_PYTHON" -m unittest discover -s tests -p 'test_*.py')

echo "[3/5] Backend smoke"
(cd "$ROOT/api" && PYTHONPATH=. "$CONTENT_OS_PYTHON" tests/smoke_test.py)

echo "[4/5] Zero-API bridge safety"
(cd "$ROOT/web" && node tests/bridge-safety.mjs)

echo "[5/5] Frontend build"
if [ -d "$ROOT/web/node_modules" ]; then
  (cd "$ROOT/web" && npm run build)
else
  echo "SKIP: web/node_modules missing. Run: cd web && npm install && npm run build"
fi

echo "Preflight complete. Live Supabase/XHS acceptance tests are still required."
