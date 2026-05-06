# Deeper Maps

A 100% client-side web app for visualising and analysing sonar scan data exported from Deeper sonar devices (Quest in v1).

Open `index.html` in a browser to use it. No installation, no server, no account.

## Status

**Plan 2 complete.** Storage, worker, state, and map rendering are all in place. A developer harness page at `npm run dev` exercises the full data flow: pick a Quest zip, watch the staged pipeline run in a Web Worker, see the four data layers render on a MapLibre map. Plan 3 swaps the harness for the real MUI UI (scan library sidebar, threshold sliders, legend, progress banner) and adds the Playwright E2E suite.

What works today:

- Quest scan parser: handles 4-column and 5-column bathymetry CSVs, variable-width sonar amplitude rows, zip uploads (with macOS resource-fork and `__MACOSX/` filtering), folder uploads, and degraded mode when `sonar.csv` is missing.
- Full analysis pipeline: lift-out detection (rolling-median + MAD), GPS interpolation, per-ping sonar analysis (weed band, fish clusters, bottom hardness, noise floor), 2 m × 2 m cell aggregation, sweet-spot categorisation (Gold/Silver/Bronze/Weeded/None).
- Outlier-trimmed colour-scale endpoints for layers (data-relative, not hardcoded).
- IndexedDB-backed scans library: scans persist across sessions; cached `LayerBundle` results re-load instantly.
- Web Worker hosting the pipeline with memoised stages, progress reporting, and proper cancellation (distinguishes user cancellation from crashes via a dedicated `kind: 'cancelled'` response).
- Zustand store mediating between IndexedDB, the worker, and the UI. 200 ms threshold debounce.
- MapLibre map with four toggleable layers (filled bathymetry contours, weed, fish-density circles, sweet-spot markers) over OSM or Esri satellite, no API keys needed. IDW grid resampling + d3-contour for the filled layers.
- Single-file production build via `vite-plugin-singlefile` (currently ~1.1 MB, ~306 KB gzipped).
- Node CLI for batch analysis: `npm run analyse -- <path-to-scan.zip>`.

## Develop

```bash
npm install
npm run dev               # Vite dev server
npm run test              # Vitest watch mode
npm run test:run          # one-shot
npm run test:coverage     # with v8 coverage; per-file thresholds 90% line/branch/function/statement
npm run typecheck
npm run lint
npm run format            # prettier --write
npm run build             # produces dist/index.html (single self-contained file)
npm run analyse -- 'path/to/scan.zip'   # run the full analysis pipeline against a real scan
```

CI runs typecheck, lint, format check, the full test suite, and the build on every push and PR. Each green commit on `main` produces a downloadable single-file `index.html` as a workflow artifact.

## Architecture

The repository follows the structure described in the design spec (`.claude/specs/2026-05-05-deeper-maps-design.md`).

```
src/analysis/        Pure-functional pipeline. No React, no DOM, no MapLibre, no storage.
  parsers/           Quest CSV parsers + zip dispatch (extension point for other devices)
  pipeline/          Six staged pure functions: cleanBathymetry → analysePings →
                     aggregateCells → categoriseCells → buildLayers (with IDW grid
                     and d3-contour helpers), plus a single-slot memoisation helper
  stats/             Rolling median, MAD, outlier-trimmed range
  constants.ts       Default thresholds (calibrated from deeper_analysis.py)
  types.ts           Pipeline result + option types
src/storage/         IndexedDB schema (scans + raw files + cached results) via idb v8
src/worker/          Web Worker hosting the pipeline; typed message protocol;
                     stage memoisation; cancellation; progress reporting
src/state/           Zustand store mediating IDB ↔ worker ↔ UI; 200ms threshold debounce
src/map/             MapLibre wiring: colour ramps, four layer style specs, MapView
                     component owning the MapLibre instance via useRef
src/lib/             SHA-256 helpers (Web Crypto)
src/App.tsx          Currently the developer harness; replaced by the real UI in Plan 3
```

The `analysis/` tree has no DOM/React/MapLibre/storage dependencies, which is what makes 90% per-file coverage achievable on the most consequential code. The worker uses the same modules, exercised end-to-end via `@vitest/web-worker` integration tests.

## Reference materials

The repo root contains:

- `HANDOFF.md` — domain explainer for Deeper sonar data (read this first if you're new).
- `deeper_analysis.py` — the Python reference implementation that the `analysis/` tree ports.
- `lake_full_analysis.png` — example reference rendering (4-panel: bathymetry, weed, fish density, sweet spots).
- `sweet_spots.csv` — sample categorised cell output for cross-reference.
- `sample-scans/` — gitignored, local-only test scans (your real fishing data).

Planning artefacts live under `.claude/specs/` and `.claude/plans/` (also gitignored).

## Licence

PostgreSQL License — see [LICENSE](LICENSE).

## Author

Dave Page
