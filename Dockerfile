# ─────────────────────────────────────────────────────────────────────
# Heva One — monorepo Dockerfile for Railway
# ─────────────────────────────────────────────────────────────────────
# Stage 1: build the React SPA with Node 22 (Capacitor 8 compatible)
# Stage 2: Python 3.11 runtime with FastAPI + the built SPA
# ─────────────────────────────────────────────────────────────────────

# ── Stage 1: Frontend build ─────────────────────────────────────────
FROM node:22-slim AS frontend-builder

WORKDIR /frontend

# Install deps first (cached layer) — only invalidated when package.json
# or yarn.lock change, not on every source edit.
COPY frontend/package.json frontend/yarn.lock ./
RUN corepack enable \
 && yarn config set network-timeout 600000 \
 && yarn install --frozen-lockfile --network-concurrency 1

# Copy the rest of the frontend source
COPY frontend/ ./

# Build the production SPA. Empty REACT_APP_BACKEND_URL makes the web
# bundle call itself (same-origin). Native APK builds bake their own URL
# at build time on the developer machine and are NOT affected by this.
ENV REACT_APP_BACKEND_URL=""
ENV NODE_OPTIONS="--max-old-space-size=2048"
RUN yarn build

# ── Stage 2: Python runtime ─────────────────────────────────────────
FROM python:3.11-slim

# gcc + build-essential are needed by some Python deps (e.g. bcrypt).
# Keep the image small by removing apt lists after install.
RUN apt-get update \
 && apt-get install -y --no-install-recommends gcc build-essential \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps first (cached layer)
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

# Copy backend source
COPY backend/ /app/backend/

# Copy the built SPA from stage 1 — server.py's static-serve block
# looks for /app/frontend/build/index.html, which matches this path.
COPY --from=frontend-builder /frontend/build /app/frontend/build

# Railway sets $PORT at runtime; default to 5000 for local runs.
ENV PORT=5000
EXPOSE 5000

WORKDIR /app/backend
CMD uvicorn server:app --host 0.0.0.0 --port ${PORT}
