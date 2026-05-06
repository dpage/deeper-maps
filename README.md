# Deeper Maps

A 100% client-side web app for visualising and analysing sonar scan data exported from Deeper sonar devices (Quest in v1).

Open `index.html` in a browser to use it. No installation, no server, no account.

## Status

**Plan 1 complete.** The project foundation is in place and the analysis pipeline has been ported from the Python reference (`deeper_analysis.py`) to TypeScript with full unit test coverage and a Python-equivalence snapshot. The UI shell is currently a placeholder; map rendering, IndexedDB persistence, and the React UI ship in Plans 2 and 3.

What works today:

- Quest scan parser: handles 4-column and 5-column bathymetry CSVs, variable-width sonar amplitude rows, zip uploads (with macOS resource-fork and `__MACOSX/` filtering), folder uploads, and degraded mode when `sonar.csv` is missing.
- Full analysis pipeline: lift-out detection (rolling-median + MAD), GPS interpolation, per-ping sonar analysis (weed band, fish clusters, bottom hardness, noise floor), 2 m × 2 m cell aggregation, sweet-spot categorisation (Gold/Silver/Bronze/Weeded/None).
- Outlier-trimmed colour-scale endpoints for layers (data-relative, not hardcoded).
- Node CLI for batch analysis: `npm run analyse -- <path-to-scan.zip>`.
- Single-file production build via `vite-plugin-singlefile`.

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

The repository follows the structure described in the design spec (`.claude/specs/2026-05-05-deeper-maps-design.md`). Plan 1 implements:

```
src/analysis/        Pure-functional pipeline. No React, no DOM, no MapLibre, no storage.
  parsers/           Quest CSV parsers + zip dispatch (extension point for other devices)
  pipeline/          Six staged pure functions: cleanBathymetry → analysePings →
                     aggregateCells → categoriseCells → buildLayers, plus a
                     single-slot memoisation helper for downstream use
  stats/             Rolling median, MAD, outlier-trimmed range
  constants.ts       Default thresholds (calibrated from deeper_analysis.py)
  types.ts           Pipeline result + option types
src/lib/             SHA-256 helpers (Web Crypto)
```

The analysis tree has no DOM/React/MapLibre/storage dependencies, which is what makes 90% per-file coverage achievable on the most consequential code.

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
