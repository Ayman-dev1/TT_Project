# ── Base image ─────────────────────────────────────────────────────────────────
# Pre-bundled Debian image with Node 20 + Python 3.10 avoids Nixpacks CXXABI bugs
FROM nikolaik/python-nodejs:python3.10-nodejs20

# ── Working directory ──────────────────────────────────────────────────────────
WORKDIR /app

# ── Step 1: Copy entire build context ─────────────────────────────────────────
COPY . .

# ── Step 2: Install Python dependencies (path-agnostic) ───────────────────────
# find locates requirements.txt anywhere under /app, excluding node_modules
RUN echo "Locating requirements.txt..." && \
    REQS=$(find /app -name "requirements.txt" \
      -not -path "*/node_modules/*" | head -1) && \
    echo "Found: $REQS" && \
    pip install --upgrade pip && \
    pip install -r "$REQS"

# ── Step 3: Install Node.js dependencies (path-agnostic) ──────────────────────
# Locate server.js in the backend folder specifically (avoids Security_Layer hit)
RUN echo "Locating Node.js backend server.js..." && \
    SERVER_JS=$(find /app -name "server.js" \
      -not -path "*/node_modules/*" \
      -not -path "*/Security_Layer/*" | grep "backend/server.js" | head -1) && \
    if [ -z "$SERVER_JS" ]; then \
      SERVER_JS=$(find /app -name "server.js" \
        -not -path "*/node_modules/*" \
        -not -path "*/Security_Layer/*" | head -1); \
    fi && \
    NODE_DIR=$(dirname "$SERVER_JS") && \
    echo "Found backend at: $NODE_DIR" && \
    cd "$NODE_DIR" && npm install --production=false

# ── Step 4: Make startup script executable ────────────────────────────────────
RUN chmod +x /app/start.sh

# ── Port declaration ──────────────────────────────────────────────────────────
# Railway injects $PORT for the publicly exposed service (Node.js)
# Django on 8000 is internal loopback only — never publicly exposed
EXPOSE 8000

# ── Entrypoint ────────────────────────────────────────────────────────────────
# start.sh handles dynamic path resolution, migrations, seeding,
# Django background launch, and exec Node.js as PID 1
CMD ["/app/start.sh"]