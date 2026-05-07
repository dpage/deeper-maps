# Deeper Maps

A 100% client-side web app for visualising and analysing sonar scan data exported from Deeper sonar devices (Quest in v1).

Open `index.html` in a browser to use it. No installation, no server, no account.

## Features

- Upload a Deeper Quest scan zip — folder with `bathymetry.csv` + `sonar.csv`. Macos-zipped exports work too (resource forks ignored).
- All processing happens locally in a Web Worker; no data leaves your machine.
- Four toggleable layers over a real-world map (OpenStreetMap or Esri satellite, no API keys):
  - Bathymetry filled contours (viridis_r — deeper = darker)
  - Weed cover (Greens)
  - Fish density graduated circles (YlOrRd, sized by sample count)
  - Sweet spots — Gold / Silver / Bronze / Weeded categorical markers
- Threshold sliders with calibrated defaults; tweak any parameter, see the map update in seconds.
- Scans library backed by IndexedDB — your scans persist across sessions.
- Single-file `index.html` distribution — runs from a USB stick on any modern browser.

## Quickstart

Download the latest [`index.html`](https://github.com/dpage/deeper-maps/releases/latest) and double-click. Or:

```bash
git clone <repo>
cd deeper-maps
npm install
npm run dev               # Vite dev server
npm run build             # → dist/index.html (single self-contained file)
```

## Develop

```bash
npm run test              # Vitest watch mode
npm run test:run          # one-shot
npm run test:coverage     # 90% per-file thresholds enforced
npm run typecheck
npm run lint
npm run format
npm run e2e               # Playwright E2E (requires `npm run build` first)
npm run analyse -- 'path/to/scan.zip'   # Node CLI: full pipeline against a real scan
```

CI runs typecheck, lint, format check, the full test suite, the build, AND Playwright E2E on every push. Each green commit on `main` produces a downloadable single-file `index.html` as a workflow artifact.

## Architecture

```
src/analysis/   Pure-functional pipeline (parser + 6 staged pipeline functions). No React/DOM/MapLibre/storage.
src/worker/     Web Worker hosting the pipeline; memoised stage cache; cancellation support.
src/storage/    IndexedDB wrapper (scans + raw files + cached results).
src/state/      Zustand store; debounces threshold changes; mediates UI ↔ worker ↔ storage.
src/map/        MapLibre instance, layer style specs, colour ramps.
src/ui/         MUI components: layout, header, scan library, upload dialog, controls, legend, progress banner.
src/lib/        SHA-256 helpers (Web Crypto).
```

See `TODO.md` for the v2 deferral list. `sample-scans/` is gitignored — drop your own Quest exports there for local testing.

## Licence

PostgreSQL License — see [LICENSE](LICENSE).

## Author

Dave Page
