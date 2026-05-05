# Deeper Quest Sonar Analysis Web App — Handoff

This document describes a small web application for visualising and analysing
sonar scan data from a Deeper Quest bait boat. The data-processing approach
below was worked out empirically against real scan data and validated against
screenshots from Deeper's own app, so most of the hard reverse-engineering
work is already done and documented here.

The accompanying `deeper_analysis.py` is a working Python pipeline that
implements the analysis. Use it as the basis for the backend; it will need
adapting (e.g. for async/streaming uploads) but the core logic is correct.

## Project goal

Build a web app that lets the user:

1. Upload a Deeper Quest scan (one or more CSV files per scan)
2. View the lake bathymetry overlaid on a real-world map (OpenStreetMap or similar)
3. Toggle layers on/off: bathymetry, weed cover, fish density, sweet spots, boat track
4. Pan and zoom freely
5. (Stretch) Click a sweet spot to see the underlying sonar waterfall slice

The user is a carp angler. The point is to identify good places to fish — areas
with fish activity over a clean enough bottom that bait can be presented
effectively.

## Data: Deeper Quest scan exports

A "scan" exported from the Deeper app is a folder containing several CSVs:

| File                 | Contents                                   | Notes                                                                                        |
| -------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `bathymetry.csv`     | `lat,lon,depth_m,temp_c,ts_ms` per ping    | New 5-column format (post-2025 firmware). Older units output 4 columns without `temp_c`.     |
| `sonar.csv`          | `ts_ms, amp_0, amp_1, ..., amp_n` per ping | Variable column count per row — depends on water depth.                                      |
| `depth_map_data.csv` | Identical to `bathymetry.csv`              | Duplicate export, can be ignored.                                                            |
| `README`             | Plain text explainer                       | Documents older models accurately but Quest details differ — see "Empirical findings" below. |

A single user fishing trip can generate multiple scan folders (the Deeper app's
"stop scan" UI is unreliable and tends to start fresh scan files at unpredictable
points). The web app should therefore allow uploading **multiple scans** that
get merged into one analysis when they're from the same lake.

### File quirks to handle defensively

- **GPS-less rows**: Bathymetry contains rows with `lat=0, lon=0` whenever the
  GPS hadn't fixed at that ping. About 95% of rows are like this — the GPS
  records at ~1 Hz while sonar runs at ~15 Hz. Linear-interpolate `lat`/`lon`
  by timestamp to recover them.
- **Duplicate timestamps**: When a GPS fix and a non-fix row share the same
  millisecond, both appear. Keep the GPS-tagged one.
- **Tiny stub files**: `depth_map_data-2.csv` was once a 28-byte file with one
  row of `(lat, lon, 0.0, 0)` because the cloud upload hadn't completed.
  Detect and skip files like this.
- **Lift-out events**: The boat is lifted out of the water for re-baiting
  while still scanning. The sonar then either pings off the bank (giving wild
  depths of 5-30+ m) or fails to detect a bottom. These pings need filtering.
- **Travel-home tails**: Some scan files contain hundreds of pings recorded
  with the boat in the back of a car, with crazy depth values throughout.
  The lift-out filter should catch most of these but a sanity check on session
  mean depth helps.

## Empirical findings about the sonar data

The official `README` documents bin spacing of 0.0104 m for CHIRP-mode devices.
**This formula does not match Quest output in auto-beam mode.** From
calibrating against real data:

- **Bin spacing: ~1.733 mm/bin** (i.e. 576.6 bins per metre of water column)
- **Bin 0 = surface** (with strong returns from transducer ringdown — first
  ~30 bins are noise and should be ignored)
- **Bin (n-1) ≈ the bottom** — i.e. the array spans the water column from
  surface to bottom only; there is essentially no sub-bottom data despite
  what the README claims
- The strong amplitude visible at bin 0-10 is **transducer ringdown noise**,
  not a bottom return
- Sonar values are integers in roughly 0-2000 range (CHIRP/PRO+2 amplitude scale)

The bin-spacing finding is empirical (n_bins / depth_m = 576.6 ± 0.85 across
thousands of pings). It may not generalise to other Deeper models or to scans
taken with auto-beam disabled. Build the constant as a configurable parameter
rather than baking it in.

## Calibration against the Deeper app

The Deeper app shows fish/weed/bottom interpretations on top of the raw sonar.
By matching screenshot timestamps to ping timestamps in the data, the
following observations emerged that drive detection logic:

1. **Fish on this water are bottom-huggers.** Every fish icon in 6 sample
   screenshots was within ~5-15 cm of the bottom. This is classic carp/bream
   behaviour. Mid-water echoes in the data are particles, bubbles, or plankton,
   not fish.
2. **The app's "weed" rendering** corresponds to a band of moderate-amplitude
   returns immediately above the strong bottom return. Hard bottom = thin
   bright peak; soft / silty / weeded bottom = thicker diffuse band.
3. **Real fish appear at ~0.3% of all pings** in Deeper's app on this lake.
   Calibrating the detector to ~3% of pings gave good visual agreement with
   the app's icons (the app has an unknown threshold; the user can also toggle
   "show only large fish" which makes app icons sparser, but the underlying
   data is unaffected).
4. **The "show only large fish" toggle** in the Deeper app affects only the
   icons, not the data. The web app's detector sees all fish-sized echoes
   regardless.

## Analysis pipeline

The pipeline produces three outputs that drive the visualisation:

### 1. Cleaned bathymetry (per ping)

After deduplication, lift-out filtering, and GPS interpolation, this is a
table of `(ts_ms, lat, lon, depth_m, temp_c, session_id)` for every usable
ping. Use this for the boat-track layer and depth map.

### 2. Per-ping analysis

For each ping, run `analyse_ping(amplitudes, depth)` to compute:

- `weed_height_m` — height of weed/silt band above the hard bottom
- `fish_count` — number of fish-like clusters detected in the bottom-hugging
  zone (i.e. within 25 cm of the bottom, above the weed band)
- `fish_max_amp` — peak amplitude of detected fish clusters (proxy for fish size)
- `hard_bottom_peak` — strongest amplitude at the bottom interface (hardness proxy)
- `noise_floor` — mid-water-column amplitude baseline (per-ping noise level)

### 3. Cell aggregation

Project `lat`/`lon` to local metres, bucket into a 2 m × 2 m grid, aggregate
per cell:

- `mean_depth`, `mean_weed`
- `n_pings` — sample size per cell (use to weight reliability)
- `fish_rate` — fraction of pings in this cell with a fish detection
- `bottom_hardness` — mean of `hard_bottom_peak`

Then categorise each cell:

| Category   | Criteria                                       | UI colour |
| ---------- | ---------------------------------------------- | --------- |
| **Gold**   | fish_rate ≥ 0.10 AND mean_weed ≤ 0.05 m        | gold      |
| **Silver** | fish_rate ≥ 0.10 AND 0.05 < mean_weed ≤ 0.15 m | green     |
| **Bronze** | 0.05 ≤ fish_rate < 0.10 AND mean_weed ≤ 0.15 m | blue      |
| **Weeded** | fish_rate ≥ 0.10 AND mean_weed > 0.15 m        | orange    |
| **None**   | otherwise                                      | grey      |

These thresholds are starting points and should be configurable in the UI.
The user may want to tune them for different waters or different fishing
strategies.

### Lift-out detection in detail

A two-stage filter:

1. **Hard threshold** — any ping with `depth_m > 5.0` is treated as a lift-out.
   This needs to be configurable for genuinely deep waters (gravel pits in the
   UK can reach 20+ m).
2. **Per-session rolling-median outlier detection** — within each session,
   compute a rolling 31-ping median and MAD. Any ping deviating from the median
   by more than `6 × MAD + 0.3 m` is flagged. This catches gradual descents
   where the boat is being lowered back into the water and depth is steadily
   decreasing through air.

Sessions are defined as ping-groups separated by gaps of >5 minutes.

## Suggested architecture

### Backend (Python)

- **FastAPI** for the HTTP layer
- **`deeper_analysis.py`** (provided) for the core analysis
- **PostgreSQL + PostGIS** for persistence (Dave works at pgEdge — PostGIS is
  the natural choice and aligns with his expertise). Store one row per ping
  in a table with a `geography(POINT)` column on `(lat, lon)`. Spatial indexes
  make the cell aggregation fast even at scale.
- **Background processing** — analysis takes seconds-to-minutes for a typical
  scan. Use a job queue (RQ or Celery) so uploads return immediately and the
  UI can poll for completion.

Suggested API endpoints:

```
POST /api/scans                        Upload scan files (multipart)
GET  /api/scans/{id}                   Scan metadata + processing status
GET  /api/scans/{id}/bathymetry        GeoJSON of depth points
GET  /api/scans/{id}/cells             GeoJSON of categorised cells
GET  /api/scans/{id}/track             GeoJSON LineString of boat path
GET  /api/scans/{id}/pings/{ts}/sonar  Raw amplitude array for waterfall view
```

Return GeoJSON throughout — both Leaflet and MapLibre GL consume it natively.

### Frontend (JavaScript)

- **MapLibre GL JS** (or Leaflet if simpler is preferred) for the base map
- **OpenStreetMap** for tiles by default; consider also offering a satellite
  layer (Esri World Imagery is free for non-commercial use)
- **GeoJSON layers** for each toggleable overlay:
  - Bathymetry: contour fills coloured by depth (compute contours server-side
    with `matplotlib.contour` or `scikit-image`, return as GeoJSON polygons)
  - Weed: similar contour-fill approach, coloured by weed height
  - Fish density: heatmap or graduated circles per cell
  - Sweet spots: categorical markers (gold/silver/bronze/weeded)
  - Boat track: simple polyline
  - Swim location: special marker (auto-detect from clustering of session
    start/end points)
- **Layer toggle UI** in a sidebar — checkboxes per layer
- **Cell click** opens a popup showing depth, weed, fish rate, sample size,
  and a small inline waterfall preview of nearby pings

### Visualisation specifics

- **Bathymetry colour scale** — use a sequential perceptually-uniform map
  (viridis_r is what the existing analysis uses). Invert so deep = dark.
- **Coordinates** — everything in WGS84 lat/lon for the front-end.
  Server-side metric calculations (cell sizing, distances, areas) use a local
  equal-area projection: `y_metres = (lat - lat0) × 111000`, `x_metres = (lon - lon0) × 111000 × cos(mean_lat)`. This is good enough at lake scale.
- **Swim auto-detection** — cluster the start and end points of all sessions
  (single-linkage hierarchical clustering with a 10 m threshold). The largest
  cluster is the swim. This works because the user always launches and recovers
  the boat from the same place.

## Gotchas / things to be careful about

- **Bin spacing is auto-beam-dependent.** If anyone uploads a scan with auto-beam
  off, the 576.6 bins/m constant will be wrong. Detect this by computing
  `n_bins / depth_m` for the first 100 pings; if it's not 576.6 ± 5, fall back
  to the README formulas or warn the user.
- **Detection thresholds are calibrated against one lake.** Carp lakes typically
  have similar profiles, but if the user fishes a deeper or more sediment-laden
  water, weed and fish thresholds will need adjustment. Make them configurable
  in the UI from the start.
- **Don't trust depths > 5 m without checking session context.** Many "deep"
  readings turn out to be lift-outs on shallow waters.
- **The same lake may appear at slightly different GPS coordinates across
  sessions** because of GPS jitter (~1-3 m typical). Don't try to auto-detect
  whether two scans are the same lake by GPS alone — let the user link them.
- **Bottom-hugging fish detection works for carp, bream, tench.** It would
  miss pelagic species (perch, pike on the prowl) which can sit anywhere in the
  water column. If the user wants those, the fish-zone constraint needs relaxing
  but expect a much higher false-positive rate.
- **The `temp_c` column is genuinely water temperature** at the surface
  (transducer is ~5 cm down). It's interesting context for the user but not
  directly used in the analysis. Worth surfacing in the UI as a per-cell average.

## Reference implementation

`deeper_analysis.py` is provided with the full pipeline as documented above.
Run it on a scan to verify it works against a known dataset before adapting:

```bash
python deeper_analysis.py bathymetry.csv sonar.csv
# Expected output: ~3% fish detection rate, ~80% clear bottom cells,
# Gold/Silver/Bronze category counts in the few-tens range for a small lake.
```

The function `process_scan(bathymetry_paths, sonar_paths)` is the top-level
entry point and returns the three DataFrames the API needs.

## What's NOT covered here that might be worth thinking about

- **Side-imaging or down-imaging interpretation** — Deeper Quest doesn't do
  this, but newer models (CHIRP+) may. Out of scope for now.
- **Multi-user / sharing** — the doc above assumes one user, one set of scans.
  If this becomes a community tool, add user accounts and per-lake aggregation
  across users.
- **Long-term tracking** — the same lake scanned across seasons would be very
  interesting. The schema should allow multiple scans per lake.
- **Catch correlation** — Dave already has an `anglers-log-catches.csv` from a
  separate logging app (analysed in an earlier conversation). If catch logs can
  be correlated to specific GPS coordinates and timestamps, the app could
  overlay catch markers on the lake map and start to validate which "sweet
  spots" actually produce fish. That's a great future feature.
- **The Ellie / pgEdge angle** — Dave's been involved in an internal AI
  assistant project at pgEdge (Postgres-focused). Storing the data in PostGIS
  in a way that's queryable by an LLM could be a fun connection.
