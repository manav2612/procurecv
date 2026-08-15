# --- Stage 1: build the frontend ---
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# --- Stage 2: backend runtime, serving the built frontend (see app/main.py) ---
FROM python:3.13-slim AS runtime
WORKDIR /app/backend

# faster-whisper decodes audio via PyAV (bundled with its own libav*), so no
# system ffmpeg package is needed here.
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./
# Mirrors the repo's local layout (repo_root/backend, repo_root/frontend) one
# level up from WORKDIR, so app/main.py's __file__-relative path resolution
# to ../frontend/dist works identically in Docker and in local dev.
COPY --from=frontend-build /app/frontend/dist /app/frontend/dist

ENV PYTHONUNBUFFERED=1
EXPOSE 8000

# Applies migrations on every start (idempotent — alembic no-ops if already
# at head). Simple and sufficient for a single-instance deploy; a multi-
# instance rollout would want a separate migration step instead, out of
# scope here. $PORT supports hosts (Render/Fly/Railway) that inject their
# own port to bind; Hugging Face Spaces doesn't, so this falls back to 8000,
# matching this file's EXPOSE and the Space config's app_port in README.md.
#
# The startup line also logs whether DATABASE_URL is present and looks like
# a real Postgres URL, WITHOUT ever printing the value itself — just
# presence, length, and a substring check. Added while debugging a Render-
# specific env var propagation issue (see TODO.md); kept since it's a cheap,
# safe sanity check on any host, not removed just because that specific bug
# is behind us now.
CMD ["sh", "-c", "echo \"[startup] DATABASE_URL: set=$([ -n \"$DATABASE_URL\" ] && echo yes || echo no) len=${#DATABASE_URL} looks_postgres=$(echo \"$DATABASE_URL\" | grep -qE '^postgres' && echo yes || echo no)\"; alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
