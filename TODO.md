# Deeper Maps — v2 TODO

Features documented in the design spec but not built in v1. Each is independently scoped; pick any.

## High priority

- **Boat track overlay** — polyline of GPS path under the existing layers. Uses the existing `CleanBath.rows` data (no pipeline change). Visibility toggle alongside the four current layers.
- ~~**Multi-scan merging**~~ — _Done (Unreleased)._ Implemented as a raw-CSV merge: "Merge scan…" on the kebab menu combines a second export's `bathymetry.csv`/`sonar.csv` into an existing scan, which is re-analysed as one (separate visits fall into separate sessions via the existing time-gap partitioning). A fuller "lake" grouping concept in the storage schema — keeping constituent scans individually addressable — remains a possible future refinement.
- **Click-cell-to-show-sonar-waterfall** — popup overlay on click that renders raw amplitude arrays as a 2D heatmap for the cell's pings. Useful for verifying detector decisions visually.

## Medium priority

- **Swim auto-detection** — single-linkage hierarchical clustering of session start/end points (10 m threshold) to identify and mark the swim location automatically. Adds a "swim" marker layer.
- **Other Deeper devices** — Chirp, Pro, Start. The parser layer is already an extension point; needs sample exports + per-device CSV format handling.
- **Catch correlation** — overlay angler-log catch markers (CSV import) to validate which sweet spots actually produced fish.

## Low priority / nice to have

- **More-contours / fewer-contours control** for the bathymetry layer (currently fixed at 12 levels).
- **Per-cell click popup** with depth/weed/fish-rate stats and inline mini-waterfall (subset of the click-cell-to-show-sonar-waterfall feature).
- **Side-by-side scan comparison** for the same lake across dates (seasonal change visualisation).
- **Long-term tracking** — UI for the same lake re-scanned across seasons.

## Out of scope

- **Side-imaging / down-imaging** interpretation (Quest doesn't produce these).
- **Multi-user / sharing** (would require a backend; not in v1's "client-side only" remit).
