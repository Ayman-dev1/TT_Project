# Use a stable, pre-bundled Node.js + Python Debian-based image
FROM nikolaik/python-nodejs:python3.10-nodejs20

# Set working directory inside the container
WORKDIR /app

# ── Step 1: Copy the entire build context first ────────────────────────────────
# This copies backend, frontend, doctor-recommend-system-main, start.sh, etc.
COPY . .

# ── Step 2: Install Python dependencies (fully dynamic) ───────────────────────
# find locates requirements.txt anywhere under /app (e.g. inside subdirectories)
RUN echo "--- Locating requirements.txt ---" && \
    REQS=$(find /app -name "requirements.txt" \
      -not -path "*/node_modules/*" | head -1) && \
    if [ -z "$REQS" ]; then echo "FATAL: requirements.txt not found" && exit 1; fi && \
    echo "Found: $REQS" && \
    pip install --upgrade pip && \
    pip install -r "$REQS"

# ── Step 3: Install Node.js Backend dependencies (fully dynamic) ──────────────
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

# ── Step 4: Install Frontend dependencies and build (fully dynamic and clean) ───
# Locate the frontend directory by searching for package.json outside backend and node_modules
RUN echo "--- Locating Frontend ---" && \
    FRONTEND_PKG=$(find /app -name "package.json" \
      -not -path "*/node_modules/*" \
      -not -path "*/backend/*" | head -1) && \
    if [ -z "$FRONTEND_PKG" ]; then echo "FATAL: frontend package.json not found" && exit 1; fi && \
    FRONTEND_DIR=$(dirname "$FRONTEND_PKG") && \
    echo "Found frontend at: $FRONTEND_DIR" && \
    cd "$FRONTEND_DIR" && \
    rm -rf dist node_modules && \
    npm install --production=false && \
    npm run build

# ── Step 5: Make the startup script executable ────────────────────────────────
RUN chmod +x /app/start.sh

# ── Port declaration ───────────────────────────────────────────────────────────
# Django on 8000 is internal loopback — never publicly exposed
EXPOSE 8000

# ── Entrypoint ────────────────────────────────────────────────────────────────
# start.sh dynamically resolves all paths at runtime, runs migrations,
# seeds the database, starts Django in the background, then exec's Node.js as PID 1
CMD ["/app/start.sh"]