# Use a stable, pre-bundled Node.js + Python Debian-based image
# This avoids the Nixpacks CXXABI / icu4c shared library bug entirely
FROM nikolaik/python-nodejs:python3.10-nodejs20

# Set working directory
WORKDIR /app

# ── Step 1: Copy the entire build context first ────────────────────────────────
# This avoids having to know the exact static path to requirements.txt
COPY . .

# ── Step 2: Install Python dependencies ───────────────────────────────────────
# Locate requirements.txt anywhere in the project and install from it
RUN pip install --upgrade pip && \
    find /app -name "requirements.txt" -not -path "*/node_modules/*" | head -1 | xargs pip install -r

# ── Step 3: Install Node.js dependencies ──────────────────────────────────────
RUN cd /app/backend && npm install --production=false

# ── Expose ports ───────────────────────────────────────────────────────────────
# Node.js listens on $PORT (injected by Railway) falling back to 5000
# Django always runs internally on 8000 (not exposed publicly)
EXPOSE 5000
EXPOSE 8000

# ── Step 4: Start both services concurrently ──────────────────────────────────
# Django starts in the background on port 8000 (localhost only)
# Node.js starts as the main foreground process so Railway tracks it
CMD ["sh", "-c", "cd /app/HospitalManagement && python manage.py migrate && python seed_medical_data.py && python seed_data.py && python manage.py runserver 0.0.0.0:8000 & cd /app/backend && node server.js"]
