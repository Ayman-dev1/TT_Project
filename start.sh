#!/bin/sh
# start.sh — Bulletproof dynamic startup script.
# Uses inline command substitution for exec so no variable scoping can interfere.
set -e

echo "==> [DEBUG] Contents of /app:"
ls /app

echo ""
echo "==> [DEBUG] Locating all server.js files (excluding node_modules and Security_Layer):"
find /app -name "server.js" -not -path "*/node_modules/*" -not -path "*/Security_Layer/*"

echo ""
echo "==> [DEBUG] Locating manage.py:"
find /app -name "manage.py" -not -path "*/node_modules/*"

echo ""
echo "==> [DEBUG] Locating requirements.txt:"
find /app -name "requirements.txt" -not -path "*/node_modules/*"

# ── Resolve Django root ────────────────────────────────────────────────────────
MANAGE_PY=$(find /app -name "manage.py" -not -path "*/node_modules/*" | head -1)
if [ -z "$MANAGE_PY" ]; then
  echo "FATAL: manage.py not found. Aborting."
  exit 1
fi
DJANGO_DIR=$(dirname "$MANAGE_PY")
echo ""
echo "==> Resolved Django root: $DJANGO_DIR"

# ── Step 1: Run migrations ────────────────────────────────────────────────────
echo "==> [1/4] Running Django migrations..."
cd "$DJANGO_DIR"
python manage.py migrate --noinput

# ── Step 2: Seed data ─────────────────────────────────────────────────────────
echo "==> [2/4] Seeding data (non-fatal on re-deploy)..."
python seed_medical_data.py || true
python seed_data.py || true

# ── Step 3: Start Django in background ────────────────────────────────────────
echo "==> [3/4] Starting Django AI service on 0.0.0.0:8000..."
python manage.py runserver 0.0.0.0:8000 &

# ── Step 4: Launch Node.js using inline find substitution ─────────────────────
# Using direct inline command substitution — no variable assignment.
# This is the most reliable method: the shell resolves the path inline at exec time.
echo "==> [4/4] Resolving and launching Node.js server..."
echo "    Target: $(find /app -name "server.js" -not -path "*/node_modules/*" -not -path "*/Security_Layer/*" | head -n 1)"

exec node $(find /app -name "server.js" -not -path "*/node_modules/*" -not -path "*/Security_Layer/*" | head -n 1)
