# Changelog

All notable changes to this project will be documented in this file.

## [1.1.0] - 2026-05-08

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
