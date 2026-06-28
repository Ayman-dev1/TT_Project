#!/bin/sh
# start.sh — Fully dynamic startup. Finds manage.py and server.js at runtime.
# No hardcoded paths. Works regardless of folder name, casing, or nesting.
set -e

echo "==> Resolving project paths dynamically..."

# ── Locate Django root (parent of manage.py) ──────────────────────────────────
MANAGE_PY=$(find /app -name "manage.py" \
  -not -path "*/node_modules/*" | head -1)

if [ -z "$MANAGE_PY" ]; then
  echo "FATAL: manage.py not found under /app. Aborting."
  exit 1
fi
DJANGO_DIR=$(dirname "$MANAGE_PY")
echo "    manage.py    -> $MANAGE_PY"
echo "    Django root  -> $DJANGO_DIR"

# ── Locate server.js using absolute path ──────────────────────────────────────
# Prefer any server.js inside a folder named 'backend', skip Security_Layer
SERVER_JS=$(find /app -name "server.js" \
  -not -path "*/node_modules/*" \
  -not -path "*/Security_Layer/*" \
  | grep "/backend/server\.js" | head -1)

# Fallback: take the first server.js that is not in node_modules or Security_Layer
if [ -z "$SERVER_JS" ]; then
  SERVER_JS=$(find /app -name "server.js" \
    -not -path "*/node_modules/*" \
    -not -path "*/Security_Layer/*" | head -1)
fi

if [ -z "$SERVER_JS" ]; then
  echo "FATAL: server.js not found under /app. Aborting."
  exit 1
fi
echo "    server.js    -> $SERVER_JS"

# ── Step 1: Run Django migrations ─────────────────────────────────────────────
echo ""
echo "==> [1/4] Running Django database migrations..."
cd "$DJANGO_DIR"
python manage.py migrate --noinput

# ── Step 2: Seed initial data ─────────────────────────────────────────────────
echo "==> [2/4] Seeding data (non-fatal if already seeded)..."
python seed_medical_data.py || true
python seed_data.py || true

# ── Step 3: Start Django in background ────────────────────────────────────────
echo "==> [3/4] Starting Django AI service on 0.0.0.0:8000 (background)..."
python manage.py runserver 0.0.0.0:8000 &

# ── Step 4: Launch Node.js as PID 1 via absolute path ────────────────────────
# Using the ABSOLUTE path to server.js — no reliance on working directory.
# 'exec' replaces this shell so Node becomes PID 1 for Railway's health checks.
echo "==> [4/4] Starting Node.js server as PID 1..."
echo "    Running: node $SERVER_JS"
exec node "$SERVER_JS"
