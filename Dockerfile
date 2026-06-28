# Use a stable, pre-bundled Node.js + Python Debian-based image
# This avoids the Nixpacks CXXABI / icu4c shared library bug entirely
FROM nikolaik/python-nodejs:python3.10-nodejs20

# Set working directory
WORKDIR /app

# ── Step 1: Copy the entire build context first ────────────────────────────────
COPY . .

# ── Step 2: Install Python dependencies ───────────────────────────────────────
# Locate requirements.txt anywhere in the project and install from it
RUN pip install --upgrade pip && \
    find /app -name "requirements.txt" -not -path "*/node_modules/*" | head -1 | xargs pip install -r

# ── Step 3: Install Node.js dependencies ──────────────────────────────────────
RUN cd /app/backend && npm install --production=false

# ── Step 4: Make the startup script executable ────────────────────────────────
RUN chmod +x /app/start.sh

# ── Expose ports ───────────────────────────────────────────────────────────────
# Only one port needs to be publicly routed by Railway (injected as $PORT → Node.js)
# Django on 8000 is internal only (localhost loopback between the two processes)
EXPOSE 8000

# ── Step 5: Run the orchestration startup script ──────────────────────────────
# start.sh runs migrations/seeds synchronously FIRST,
# then starts Django in the background,
# then exec's Node.js as PID 1 so Railway can health-check and signal it correctly.
CMD ["/app/start.sh"]
