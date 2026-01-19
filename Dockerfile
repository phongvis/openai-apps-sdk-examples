# ==============================================================================
# Stage 1: Node.js Builder - Build Frontend Widget Assets
# ==============================================================================
FROM node:20-alpine AS builder

# Install pnpm with exact version from package.json
RUN corepack enable && corepack prepare pnpm@10.13.1 --activate

WORKDIR /build/web

# Copy package files for dependency installation
COPY web/package.json web/pnpm-lock.yaml ./

# Install dependencies with frozen lockfile for reproducible builds
RUN pnpm install --frozen-lockfile

# Copy source files needed for build
COPY web/build-all.mts web/tsconfig*.json web/vite*.mts web/tailwind.config.ts web/vite-env.d.ts ./
COPY web/src/ ./src/

# Build argument for BASE_URL (can be overridden in CI/CD)
# Default points to the same server that will serve static files
ARG BASE_URL=http://localhost:8000/dist
ENV BASE_URL=${BASE_URL}

# Build all widgets - generates hashed assets in /build/web/dist/
RUN pnpm run build

# Verify build output
RUN ls -lah /build/web/dist/ && \
    echo "Built assets:" && \
    find /build/web/dist/ -type f \( -name "*.html" -o -name "*.js" -o -name "*.css" \)

# ==============================================================================
# Stage 2: Python Runtime - MCP Server with Static File Serving
# ==============================================================================
FROM python:3.11-slim

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app

# Copy Python project files
COPY server/pyproject.toml server/requirements.txt ./server/

# Install Python dependencies with uv
WORKDIR /app/server
RUN uv sync --no-dev --frozen

# Copy built assets from Stage 1
COPY --from=builder /build/web/dist/ /app/web/dist/

# Copy server code
COPY server/main.py ./
COPY server/startup.py ./

# Expose port 8000 for both MCP and static file serving
EXPOSE 8000

# Health check - verify server is responding
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000').read()"

# Run the startup script which wraps main.py with static file serving
# --proxy-headers: Trust X-Forwarded-* headers from proxies (ngrok, nginx, etc.)
# --forwarded-allow-ips='*': Accept forwarded headers from any IP (for ngrok)
CMD ["uv", "run", "uvicorn", "startup:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips=*"]
