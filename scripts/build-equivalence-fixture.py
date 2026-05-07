"""
Generate a synthetic scan fixture and run it through deeper_analysis.py.
Writes:
  - test/fixtures/reference-bath.csv
  - test/fixtures/reference-sonar.csv
  - test/fixtures/reference-snapshot.json  (cell rows, sorted by cx/cy)

This script runs ONCE and its output is committed; tests do not invoke it.

Requires `deeper_analysis.py` at the repo root. That file is gitignored
(personal handoff material kept locally for reference); a fresh clone
will not have it. Re-running this script is only relevant if the Python
reference itself changes.
"""
import csv, json, math, sys, pathlib, random
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from deeper_analysis import process_scan

random.seed(42)

OUT = pathlib.Path(__file__).resolve().parents[1] / 'test' / 'fixtures'
OUT.mkdir(parents=True, exist_ok=True)
bath_path = OUT / 'reference-bath.csv'
sonar_path = OUT / 'reference-sonar.csv'
snap_path = OUT / 'reference-snapshot.json'

# Build a 30x30 m grid of pings, ~2m grid spacing, around 51.7N, -1.43E.
LAT0, LON0 = 51.7, -1.43
DEG_PER_M = 1 / 111000.0
n_grid = 15
ts = 1_700_000_000_000
bath_rows = []
sonar_rows = []
BINS_PER_M = 576.6

for gx in range(n_grid):
    for gy in range(n_grid):
        lat = LAT0 + gy * 2 * DEG_PER_M
        lon = LON0 + gx * 2 * DEG_PER_M / math.cos(math.radians(LAT0))
        depth = 1.5 + 0.05 * gx
        for _ in range(5):  # 5 pings per cell
            bath_rows.append((lat, lon, depth, 18.0, ts))
            n_bins = int(depth * BINS_PER_M) + 50
            amps = [5] * n_bins
            for i in range(min(30, n_bins)):
                amps[i] = 1500   # ringdown
            for i in range(max(0, n_bins - 8), n_bins):
                amps[i] = 1500   # bottom return
            # Insert a fish in some cells (gx % 3 == 0): 1 fish per ping.
            if gx % 3 == 0:
                # Place a 5-bin fish cluster ~30 bins above the bottom.
                fish_centre = n_bins - 8 - 30
                for i in range(fish_centre - 2, fish_centre + 3):
                    if 30 <= i < n_bins - 8:
                        amps[i] = 800
            sonar_rows.append((ts, *amps))
            ts += 67

with open(bath_path, 'w', newline='') as f:
    w = csv.writer(f)
    for r in bath_rows: w.writerow(r)
with open(sonar_path, 'w', newline='') as f:
    w = csv.writer(f)
    for r in sonar_rows: w.writerow(r)

print(f"wrote {len(bath_rows)} bath rows, {len(sonar_rows)} sonar rows")

result = process_scan([str(bath_path)], [str(sonar_path)])
cells = result['cells']
cells = cells.sort_values(['cx', 'cy']).reset_index(drop=True)
out = {
    'n_pings_total': int(result['pings'].shape[0]),
    'fish_pings': int((result['pings'].fish_count >= 1).sum()),
    'cells': [
        {
            'cx': float(r.cx), 'cy': float(r.cy),
            'n_pings': int(r.n_pings),
            'mean_depth': float(r.mean_depth),
            'mean_weed': float(r.mean_weed),
            'fish_rate': float(r.fish_rate),
            'category': str(r.category),
        }
        for _, r in cells.iterrows()
    ],
}
snap_path.write_text(json.dumps(out, indent=2))
print(f"wrote snapshot: {snap_path}")
