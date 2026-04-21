# ─────────────────────────────────────────────────────────────────────
# Heva One — monorepo Dockerfile for Railway
# ─────────────────────────────────────────────────────────────────────
# Node 24 matches developer's local env (where APK builds succeed).
# Python 3.11 matches backend/requirements.txt compatibility.
# Steps are split into individual RUNs so a failure shows the exact line
# that died rather than hiding inside a chained shell command.
# ─────────────────────────────────────────────────────────────────────

# ── Stage 1: Frontend build ─────────────────────────────────────────
FROM node:24-slim AS frontend-builder

WORKDIR /frontend

# Enable corepack (ships with Node 24) and pin yarn to the version
# declared in package.json's `packageManager` field. This is more
# reliable than `npm install -g yarn` which failed silently on earlier
# attempts due to npm permission / cache edge cases inside node:24-slim.
RUN corepack enable && corepack prepare yarn@1.22.22 --activate && yarn --version

# Copy dependency manifest first so this layer is cached independently
# from source changes.
COPY frontend/package.json frontend/yarn.lock ./

# Split install step from source copy. Non-interactive + longer timeout
# for Railway's sometimes-slow registry mirror.
# --ignore-engines: Capacitor CLI declares ">=22.0.0" — since we're on
# Node 24 this is unneeded in theory, but adding it makes us immune to
# any future engine-range tightening by upstream packages.
RUN yarn install --non-interactive --network-timeout 600000 --ignore-engines

# Copy the rest of the frontend source
COPY frontend/ ./

# Build the production SPA.
# - Empty REACT_APP_BACKEND_URL makes the web bundle call itself (same-
#   origin). Native APK builds bake their own URL at `yarn build` time on
#   the developer machine and are NOT affected by this value.
# - CI=false prevents Create-React-App from failing on warnings.
ENV REACT_APP_BACKEND_URL=""
ENV NODE_OPTIONS="--max-old-space-size=2048"
ENV CI=false
RUN yarn build

# ── Stage 2: Python runtime ─────────────────────────────────────────
FROM python:3.11-slim

# gcc + build-essential are required by some Python wheels (e.g. bcrypt,
# aiohttp) that compile native extensions during pip install.
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
