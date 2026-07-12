# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- Deeper mobile (iOS/Android) `scan_data` CSV import — the app's single-CSV export (depth + temperature + GPS, no sonar) can now be uploaded directly, not just the Quest zip. It's detected automatically and rendered as a depth-contour and water-temperature map with the click-to-inspect popup; weed, fish density and sweet spots are unavailable (those need the raw sonar returns, which this export doesn't contain — a banner explains this). Sparse mobile GPS is interpolated between fixes, and the temperature `0.0` "no reading" sentinel is treated as missing so it doesn't skew the scale. Mobile scans can be **merged and exported** like Quest scans (they're normalised to the common format on the way in), so all your scans of a lake — mobile or Quest — combine into one map. Merging two mobile scans keeps depth + temperature everywhere; merging a mobile scan with a Quest scan keeps the Quest sonar analysis where it exists plus a combined depth map.
- Click-to-inspect popup — tap or click anywhere on the scanned area to open a tooltip for the nearest surveyed spot, showing when it was scanned (date/time, or a range for spots crossed on more than one visit), depth, water temperature, weed height, fish rate and sample count. Tapping another spot moves the popup; tapping off the scan closes it.
- Sweet-spot limit — a "Max shown" slider in the panel (default 12) caps how many sweet-spot markers appear at once. On busy lakes that categorise hundreds of cells the markers were an unreadable blanket; the map now shows only the best spots (gold → silver → bronze → weeded, then higher fish-rate) within the current viewport, re-picked as you pan and zoom.
- Collapsible sidebar — the scan list / controls panel can now be opened and closed with an edge handle, so the map is usable on narrow screens. It starts collapsed on phone-width viewports (and capped to 85% width when open, keeping a strip of map and the handle reachable) and open on wider screens.
- Merge scans — a "Merge scan…" option on each scan's kebab menu lets you upload a second Deeper export and fold its bathymetry and sonar data into an existing scan. Ideal for a lake you re-visit across several sessions: the combined data is re-analysed as one, and separate sessions are kept apart automatically by the existing time-gap partitioning. Scans built from more than one export show an "N scans merged" note in the library.
- Export scans — an "Export" option on the kebab menu downloads a scan (including any merged-in data) as a `bathymetry.csv` + `sonar.csv` zip in the exact layout the app imports, so combined scans can be shared with others and re-imported anywhere.

### Fixed

- Exporting a scan no longer risks a truncated download: the object URL backing the download is now released on a timer rather than synchronously after the click, which could abort a large file before the browser finished reading it.
- Large scans (tens of MB) that previously appeared to process on iPads and other memory-constrained devices and then displayed nothing now work, or fail with a clear message instead of silently. The CSV parser no longer materialises the whole file as one giant string plus a full array of every cell; it now scans the decompressed bytes line by line, which drastically lowers peak memory. Only the two CSVs we actually parse (`bathymetry.csv` + `sonar.csv`) are decompressed from the upload zip — other archive entries are skipped rather than inflated. Raw file bytes are transferred to (not copied into) the analysis worker.
- The app now surfaces a message when the analysis worker crashes or goes silent — most often the operating system killing the Web Worker for running out of memory on an oversized scan — instead of leaving the upload spinning with no feedback.

### Added

- Temperature overlay layer rendered as filled IDW contours using a sequential plasma colour ramp. Hidden when the scan contains no temperature data.
- Min / avg / max temperature display in the active scan panel for scans that include temperature readings.
- Temperature swatch in the legend, showing the trimmed range alongside the existing depth, weed and fish-density swatches.
- Conditional Temperature toggle in the layer controls, only shown when the scan contains temperature data.

### Changed

- Bathymetry contours now render as line-style (rather than filled) whenever any other filled overlay (weed or temperature) is on, so depth contours stay visible over the filled colours.
- `LayerBundle` schema bumped from v5 to v6. Cached results are automatically re-analysed on next scan selection after upgrade — no user action required.

### Fixed

- Scans from devices without GPS data in their export (e.g. the Deeper Start) are now rejected at upload with a clear explanatory error, instead of silently producing an empty map.
- Layer colour expressions are now updated when a scan's data arrives, so contour colours render correctly across the scan's actual value range. Previously, layers were initialised with a fallback `[0, 1]` interpolate domain and then never refreshed; any data outside that range rendered as a single clamped colour. Bathymetry and weed only looked correct by coincidence with their typical ranges; the temperature layer (with values around 20–25 °C) made the bug visible.
- Temperature contour bands no longer cumulatively stack: each grid cell is covered by exactly one band, so colour discrimination matches the underlying data.
- Bathymetry contour lines are now drawn above all filled overlays (previously the temperature fill obscured them).

## [1.0.0] - 2026-05-07

Initial release.
