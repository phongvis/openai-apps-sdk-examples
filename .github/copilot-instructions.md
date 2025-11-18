# Copilot Instructions

## Architecture Snapshot
- React 19 widget gallery; each widget lives under `src/<widget>` with an `index.jsx` entry that renders into a DOM element whose id matches the folder name (for example `pizzaz-root`) and exports the default `App` for reuse.
- `assets/` stores the built `.html/.js/.css` bundles that MCP servers return; regenerate them instead of hand editing.
- Shared hooks like `src/use-openai-global.ts`, `use-widget-state.ts`, and `use-widget-props.ts` provide the bridge to the ChatGPT sandbox globals.
- Widget data/seeds (for example `pizzaz/markers.json`, `pizzaz-albums/albums.json`) live alongside the widget and feed the UI.

## Build & Dev
- Use `pnpm install` once; scripts assume pnpm (see `package.json` with `tsx`-based tooling).
- `pnpm run dev` serves every widget at `http://localhost:4444/<name>.html` using the custom multi-entry Vite plugin in `vite.config.mts`.
- `pnpm run build` executes `build-all.mts`; it wipes `assets/`, bundles React + Tailwind per entry, and hashes filenames using the `package.json` version (bump the version when you need a new cache-busting hash).
- Build coverage is gated by the hard-coded `targets` list in `build-all.mts`; add new widget folder names there or they will be skipped.
- Set `BASE_URL=https://your-host` before building when generating HTML for a deployed asset CDN; otherwise links default to `http://localhost:4444`.
- `pnpm run serve` static-hosts the built `assets/` on port 4444 with CORS for MCP clients; `dev-all.mts` can proxy Vite (4450) to the legacy 4444 endpoint if needed.

## Widget Patterns
- The sandbox pushes globals via the custom `openai:set_globals` event; `useOpenAiGlobal` subscribes and returns `window.openai` values like `displayMode`, `maxHeight`, and `widgetState`.
- Persist per-session widget state with `useWidgetState`; it syncs through `window.openai.setWidgetState` and mirrors incoming state updates.
- When you need tool outputs, call `useWidgetProps` to read `window.openai.toolOutput`; fall back to mock defaults for local dev.
- Some legacy widgets (for example `pizzaz/index.jsx`) still check `window.oai` or `window.webplus`; keep those shims when refactoring to avoid breaking older hosts.
- Router-aware widgets (pizzaz map) use `react-router-dom` even inside the sandbox; preserve `<BrowserRouter>` wrapping in the entry file.

## MCP Servers
- The Python example (`pizzaz_server_python/main.py`) uses FastMCP with `stateless_http=True`; run via `uvicorn <package>.main:app --port 8000` after installing the respective `requirements.txt`.
- Server metadata helpers stamp the required `_meta` keys like `openai/outputTemplate`; reuse them to keep ChatGPT rendering the widget.
- Inputs are validated with Pydantic schemas and responses embed widget HTML via `TextResourceContents`; keep schema and metadata in sync with widget IDs/URIs when adding new tools.

## Styling & Assets
- Tailwind v4 is injected through the Vite Tailwind plugin; global rules live in `src/index.css` and are prepended automatically by the `wrapEntryPlugin` helper in `build-all.mts`.
- Per-widget CSS files co-located under the widget directory are auto-imported (glob `**/*.{css,pcss,scss,sass}` excluding modules); no need for manual index.css imports.
- External styles (Mapbox, react-datepicker) are typically injected at runtime within each widget; follow that pattern rather than editing `index.css` for niche styling.
- Static media should be referenced by URL or placed under `assets/` if it needs bundling; hashed outputs go next to their non-hashed alias (for example `pizzaz-<hash>.html` plus `pizzaz.html`).

## Development Tips
- Mapbox-powered widgets expect the access token defined in `pizzaz/index.jsx`; replace it via env injection if you intend to ship widely.
- There is no automated test suite; exercise widgets in the Vite dev server and through MCP tool calls after building assets.
- When introducing a new widget/tool pair, update both `build-all.mts` (`targets` array) and the server widget registries so the MCP metadata, HTML filenames, and tool names stay aligned.
- Keep an eye on bundle size warnings: `chunkSizeWarningLimit` is raised to 2000 KB, so crossing it likely indicates a dependency mistake.
- For deployment, ensure the process sets `BASE_URL` to the public asset origin and that MCP responses reference the matching `ui://widget/<name>.html` URIs.
- For deployments, export `BASE_URL=<public origin>` before running `pnpm run build` so generated HTML points at the hosted assets.