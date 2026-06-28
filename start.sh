#!/bin/sh
# start.sh — Fully path-agnostic startup. Dynamically resolves all directories.
set -e

echo "==> Resolving project paths dynamically..."

# ── Resolve Django root (parent of manage.py) ──────────────────────────────────
MANAGE_PY=$(find /app -name "manage.py" -not -path "*/node_modules/*" | head -1)
if [ -z "$MANAGE_PY" ]; then
  echo "FATAL: manage.py not found under /app. Aborting."
  exit 1
fi
DJANGO_DIR=$(dirname "$MANAGE_PY")
echo "    Django root  -> $DJANGO_DIR"

# ── Resolve Node.js backend path ──────────────────────────────────────────────
SERVER_JS=$(find /app -name "server.js" \
  -not -path "*/node_modules/*" \
  -not -path "*/Security_Layer/*" \
  | grep "/backend/server\.js" | head -1)

if [ -z "$SERVER_JS" ]; then
  SERVER_JS=$(find /app -name "server.js" \
    -not -path "*/node_modules/*" \
    -not -path "*/Security_Layer/*" | head -1)
fi

if [ -z "$SERVER_JS" ]; then
  echo "FATAL: server.js not found under /app. Aborting."
  exit 1
fi
NODE_DIR=$(dirname "$SERVER_JS")
echo "    Node.js root -> $NODE_DIR"

# ── Step 1: Run Django database migrations ────────────────────────────────────
echo ""
echo "==> [1/4] Running Django database migrations..."
cd "$DJANGO_DIR"
python manage.py migrate --noinput

# ── Step 2: Seed initial medical data ─────────────────────────────────────────
echo "==> [2/4] Seeding data (non-fatal on re-deploy)..."
python seed_medical_data.py || true
python seed_data.py || true

# ── Step 3: Start Django AI service ───────────────────────────────────────────
echo "==> [3/4] Starting Django AI service on 0.0.0.0:8000 (background)..."
python manage.py runserver 0.0.0.0:8000 &

# ── Step 4: Launch Node.js backend as PID 1 ────────────────────────────────────
echo "==> [4/4] Starting Node.js backend..."
cd "$NODE_DIR"
exec node server.js
