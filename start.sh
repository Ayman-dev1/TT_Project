#!/bin/sh
# start.sh — Orchestrates Django (background) then Node.js (foreground / PID 1)
set -e  # Exit immediately if any command fails

echo "==> [1/4] Running Django database migrations..."
cd /app/HospitalManagement
python manage.py migrate --noinput

echo "==> [2/4] Seeding medical specialties and keywords..."
# Use '|| true' so a duplicate-key error on re-deploy does not crash startup
python seed_medical_data.py || true
python seed_data.py || true

echo "==> [3/4] Starting Django AI service on port 8000 (background)..."
python manage.py runserver 0.0.0.0:8000 &

echo "==> [4/4] Starting Node.js backend (foreground, Railway public port)..."
cd /app/backend
# 'exec' replaces this shell with Node so Node becomes PID 1.
# Railway health checks and signal forwarding (SIGTERM on deploy) work correctly.
exec node /app/backend/server.js
