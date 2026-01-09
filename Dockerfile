# ==============================================================================
# Stage 1: Node.js Builder - Build Frontend Widget Assets
# ==============================================================================
FROM node:20-alpine AS builder

# Install pnpm with exact version from package.json
RUN corepack enable && corepack prepare pnpm@10.13.1 --activate

WORKDIR /build

# Copy package files for dependency installation
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Install dependencies with frozen lockfile for reproducible builds
RUN pnpm install --frozen-lockfile

# Copy source files needed for build
COPY build-all.mts tsconfig*.json vite*.mts tailwind.config.ts vite-env.d.ts ./
COPY src/ ./src/

# Build argument for BASE_URL (can be overridden in CI/CD)
# Default points to the same server that will serve static files
ARG BASE_URL=http://localhost:8000/assets
ENV BASE_URL=${BASE_URL}

# Build all widgets - generates hashed assets in /build/assets/
RUN pnpm run build

# Verify build output
RUN ls -lah /build/assets/ && \
    echo "Built assets:" && \
    find /build/assets/ -type f \( -name "*.html" -o -name "*.js" -o -name "*.css" \)

# ==============================================================================
# Stage 2: Python Runtime - MCP Server with Static File Serving
# ==============================================================================
FROM python:3.11-slim

WORKDIR /app

# Copy Python requirements
COPY server/requirements.txt ./server/

# Install Python dependencies
# Note: httpx is added here as it's used in the code but missing from requirements.txt
RUN pip install --no-cache-dir -r server/requirements.txt && \
    pip install --no-cache-dir httpx

# Copy built assets from Stage 1
COPY --from=builder /build/assets/ ./assets/

# Copy server code
COPY server/main.py ./server/
COPY server/startup.py ./server/

# Expose port 8000 for both MCP and static file serving
EXPOSE 8000

# Health check - verify server is responding
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000').read()"

# Set working directory to server so uvicorn can find startup.py
WORKDIR /app/server

# Run the startup script which wraps main.py with static file serving
# --proxy-headers: Trust X-Forwarded-* headers from proxies (ngrok, nginx, etc.)
# --forwarded-allow-ips='*': Accept forwarded headers from any IP (for ngrok)
CMD ["uvicorn", "startup:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips=*"]
