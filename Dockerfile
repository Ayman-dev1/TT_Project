# ── Base image ─────────────────────────────────────────────────────────────────
# Pre-bundled Debian image with Node 20 + Python 3.10
# Avoids Nixpacks CXXABI / icu4c shared library bugs entirely
FROM nikolaik/python-nodejs:python3.10-nodejs20

# ── Working directory ──────────────────────────────────────────────────────────
WORKDIR /app

# ── Step 1: Copy the entire build context ─────────────────────────────────────
COPY . .

# ── Step 2: Install Python dependencies (fully dynamic) ───────────────────────
# find locates requirements.txt anywhere — no hardcoded path needed
RUN echo "--- Locating requirements.txt ---" && \
    REQS=$(find /app -name "requirements.txt" \
      -not -path "*/node_modules/*" | head -1) && \
    if [ -z "$REQS" ]; then echo "FATAL: requirements.txt not found" && exit 1; fi && \
    echo "Found: $REQS" && \
    pip install --upgrade pip && \
    pip install -r "$REQS"

# ── Step 3: Install Node.js dependencies (fully dynamic) ──────────────────────
# Locate the backend server.js by absolute path — skips Security_Layer
RUN echo "--- Locating Node.js backend ---" && \
    SERVER_JS=$(find /app -name "server.js" \
      -not -path "*/node_modules/*" \
      -not -path "*/Security_Layer/*" \
      | grep "/backend/server\.js" | head -1) && \
    if [ -z "$SERVER_JS" ]; then \
      SERVER_JS=$(find /app -name "server.js" \
        -not -path "*/node_modules/*" \
        -not -path "*/Security_Layer/*" | head -1); \
    fi && \
    if [ -z "$SERVER_JS" ]; then echo "FATAL: server.js not found" && exit 1; fi && \
    NODE_DIR=$(dirname "$SERVER_JS") && \
    echo "Found server.js at: $SERVER_JS" && \
    cd "$NODE_DIR" && npm install --production=false

# ── Step 4: Make the startup script executable ────────────────────────────────
RUN chmod +x /app/start.sh

# ── Port declaration ───────────────────────────────────────────────────────────
# Railway injects $PORT for Node.js (the publicly exposed service)
# Django on 8000 is internal loopback — never publicly exposed
EXPOSE 8000

# ── Entrypoint ────────────────────────────────────────────────────────────────
# start.sh dynamically resolves all paths at runtime, runs migrations,
# seeds the database, starts Django in the background, then exec's Node.js as PID 1
CMD ["/app/start.sh"]