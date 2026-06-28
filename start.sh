#!/bin/sh
# start.sh — Dynamically locates Django and Node.js roots, then starts both services.
# This script is path-agnostic and will work regardless of folder casing or nesting.
set -e

echo "==> Resolving project directories dynamically..."

# Locate manage.py — the Django project root is its parent directory
MANAGE_PY=$(find /app -name "manage.py" -not -path "*/node_modules/*" | head -1)
if [ -z "$MANAGE_PY" ]; then
  echo "ERROR: manage.py not found anywhere under /app. Aborting."
  exit 1
fi
DJANGO_DIR=$(dirname "$MANAGE_PY")
echo "    Django root  : $DJANGO_DIR"

# Locate server.js — prefer the one inside a directory named 'backend'
# The grep filter excludes node_modules AND the Security_Layer server.js
SERVER_JS=$(find /app -name "server.js" \
  -not -path "*/node_modules/*" \
  -not -path "*/Security_Layer/*" | grep "backend/server.js" | head -1)
if [ -z "$SERVER_JS" ]; then
  # Fallback: take the first server.js that is not in Security_Layer or node_modules
  SERVER_JS=$(find /app -name "server.js" \
    -not -path "*/node_modules/*" \
    -not -path "*/Security_Layer/*" | head -1)
fi
if [ -z "$SERVER_JS" ]; then
  echo "ERROR: server.js not found anywhere under /app. Aborting."
  exit 1
fi
NODE_DIR=$(dirname "$SERVER_JS")
echo "    Node.js root : $NODE_DIR"

# ── Step 1: Django migrations (must complete before anything starts) ───────────
echo ""
echo "==> [1/4] Running Django database migrations..."
cd "$DJANGO_DIR"
python manage.py migrate --noinput

# ── Step 2: Seed initial data ─────────────────────────────────────────────────
echo "==> [2/4] Seeding medical data (errors are non-fatal on re-deploy)..."
python seed_medical_data.py || true
python seed_data.py || true

# ── Step 3: Start Django in the background ────────────────────────────────────
echo "==> [3/4] Starting Django AI service on 0.0.0.0:8000 (background)..."
python manage.py runserver 0.0.0.0:8000 &

# ── Step 4: Hand over to Node.js as PID 1 ────────────────────────────────────
# 'exec' replaces this shell so Node.js becomes PID 1.
# Railway health checks, $PORT routing, and SIGTERM forwarding all work correctly.
echo "==> [4/4] Starting Node.js backend as main process (PID 1)..."
cd "$NODE_DIR"
exec node server.js
