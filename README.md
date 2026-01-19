# Radar Lite OpenAI App

```bash
# Web (widget)
# http://localhost:4444
pnpm install
pnpm run dev

# Build deployment to Github Pages
pnpm run build:gh 

# Server, port 8000
cd server
uv sync
uv run main.py

# Inspect MCP tools
npx @modelcontextprotocol/inspector
```