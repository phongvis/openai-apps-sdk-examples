"""Production startup script for the Radar Lite MCP server.

This wrapper adds static file serving to the MCP server for Docker deployments.
It imports the FastAPI app from main.py and mounts a static files endpoint.

Architecture:
- Imports the FastAPI app and log function from main.py
- Mounts /assets endpoint to serve built widget files (HTML, JS, CSS)
- Allows ChatGPT to fetch widget resources from the same server as MCP
- Adds middleware to handle requests from proxies (ngrok, nginx, etc.)

Usage:
    uvicorn startup:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips='*'
"""

from pathlib import Path
import os
from starlette.middleware.cors import CORSMiddleware
from starlette.staticfiles import StaticFiles
from main import app, log


# Log host-related headers to help diagnose proxy issues
@app.middleware("http")
async def log_host_headers(request, call_next):
    host = request.headers.get("host")
    x_forwarded_host = request.headers.get("x-forwarded-host")
    x_forwarded_for = request.headers.get("x-forwarded-for")
    x_forwarded_proto = request.headers.get("x-forwarded-proto")
    log(
        "🔎 Host headers: "
        f"Host={host} "
        f"X-Forwarded-Host={x_forwarded_host} "
        f"X-Forwarded-For={x_forwarded_for} "
        f"X-Forwarded-Proto={x_forwarded_proto} "
        f"Server={request.scope.get('server')} "
        f"Scheme={request.scope.get('scheme')}"
    )

    return await call_next(request)

# Determine assets directory relative to this file
# Container structure: /app/server/startup.py and /app/assets/
ASSETS_DIR = Path(__file__).resolve().parent.parent / "assets"

cors_origins_raw = os.getenv("ASSETS_CORS_ORIGINS", "*").strip()
cors_origins = ["*"] if cors_origins_raw == "*" else [
    origin.strip() for origin in cors_origins_raw.split(",") if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_methods=["GET", "HEAD", "OPTIONS"],
    allow_headers=["*"],
    allow_credentials=False,
)
log(f"🧭 CORS enabled for assets: {cors_origins_raw or '*'}")

log("=" * 60)
log("🚀 PRODUCTION STARTUP - ADDING STATIC FILE SERVING")
log("=" * 60)
log(f"📂 Assets directory: {ASSETS_DIR}")
log(f"   Absolute path: {ASSETS_DIR.absolute()}")
log(f"   Exists: {ASSETS_DIR.exists()}")

if ASSETS_DIR.exists():
    # List available widget files
    html_files = list(ASSETS_DIR.glob("*.html"))
    log(f"   Found {len(html_files)} HTML files:")
    for html_file in sorted(html_files):
        log(f"      - {html_file.name}")

    # Mount static files endpoint
    app.mount("/assets", StaticFiles(directory=str(ASSETS_DIR)), name="assets")
    log("✅ Static file serving enabled at /assets")
    log("   Widget resources available at: http://localhost:8000/assets/")
    log("   Example: http://localhost:8000/assets/radar-lite.html")
else:
    log(f"⚠️  WARNING: Assets directory not found at {ASSETS_DIR}")
    log("   Static file serving will NOT be available")
    log("   Make sure you ran 'pnpm run build' before building the Docker image")

log("=" * 60)
