#!/bin/sh
# start.sh — Start script for single service Node.js + Django deployment
set -e

echo "==> [1/4] Running Django database migrations..."
cd /app/HospitalManagement
python manage.py migrate --noinput

echo "==> [2/4] Seeding medical specialties and keywords..."
python seed_medical_data.py || true
python seed_data.py || true

echo "==> [3/4] Starting Django AI service on port 8000 (background)..."
python manage.py runserver 0.0.0.0:8000 &

echo "==> [4/4] Starting Node.js backend (foreground)..."
cd /app/backend
# 'exec' replaces this shell with the Node process so it runs as PID 1
exec node server.js
