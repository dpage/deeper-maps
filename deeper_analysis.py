"""
deeper_analysis.py — Reference pipeline for analysing Deeper Quest sonar data.

This module encapsulates the analysis approach worked out in conversation
between Dave and Claude. It is intended as a starting point for the web app's
backend processing, not as production-ready code. Everything here was empirically
calibrated against one lake's data plus app screenshots; thresholds may need
adjustment for other waters or different Deeper models.

INPUT FILES (per scan, all are CSVs without headers):
    bathymetry.csv:  lat, lon, depth_m, temp_c, ts_ms          (5 cols, post-2025 firmware)
                  OR lat, lon, depth_m, ts_ms                   (4 cols, older firmware)
    sonar.csv:       ts_ms, amp_0, amp_1, ..., amp_n            (variable n)
    depth_map_data.csv: identical to bathymetry.csv (duplicate export)

KEY EMPIRICAL FACTS:
    - Bin spacing in the sonar array: 1 / 576.6 metres = 1.733 mm/bin
    - The README from Deeper documents 0.0104 m/bin for the CHIRP base mode,
      but the Quest in auto-beam mode produces this much finer resolution.
    - Bin 0 is just below the surface (transducer); the bottom is at bin
      ≈ 576.6 × depth_m. There is essentially no sub-bottom data in the export.
    - The first ~30 bins are transducer ringdown — ignore them.
    - GPS records at ~1 Hz; sonar at ~15 Hz. Many sonar pings have no GPS fix
      and need linear interpolation from neighbouring GPS-tagged pings.

KEY CALIBRATION FACTS (from app screenshots):
    - Fish on this water are bottom-huggers. Detect fish only as bright echoes
      within ~25 cm of the bottom; mid-water echoes are particles/bubbles.
    - The app shows weed as a green band immediately above a hard orange bottom.
      In the raw data this is a band of moderate-amplitude bins above the strong
      bottom return.
    - The "Show large fish only" toggle in the app affects what icons appear
      there but NOT the underlying data. Our detector sees all fish-sized echoes.

KEY GOTCHAS:
    - Lift-out events: the Deeper app has no obvious "stop scan" button, so a
      single scan file often contains the boat being lifted out and put back in
      multiple times, plus sometimes a long tail with the boat in the car going
      home. These show as depth values of 5-30+ m and need filtering.
    - Same lake, multiple scan files: app may export several "scans" from one
      day's fishing, each containing several start/stop sessions (we saw 11
      sessions across 2 files for one weekend).
    - Duplicate timestamps in bathymetry.csv where GPS-tagged and untagged rows
      both exist for the same ms. Prefer the GPS-tagged one.
    - The depth_map_data-2.csv from the original upload was a 28-byte stub
      (one row, depth=0, ts=0) — that's a Deeper cloud sync artefact when the
      scan hasn't finished processing yet. Skip files like this.
"""

import numpy as np
import pandas as pd
import csv
from typing import Optional


# ---------- Constants ----------

BINS_PER_M = 576.6           # Empirical: bins-per-metre in the sonar array
RINGDOWN_BINS = 30           # Skip these top bins (transducer noise)
BOTTOM_HUG_M = 0.25          # Fish must be within this distance of bottom
WEED_AMP_FACTOR = 4          # Amplitude > 4 × noise floor = weed
WEED_MIN_AMP = 30            # Absolute floor for the weed threshold
FISH_AMP_FACTOR = 10         # Amplitude > 10 × noise floor = fish
FISH_MIN_AMP = 200           # Absolute floor for fish detection (calibrated to ~3% rate)
FISH_MIN_RUN = 3             # Cluster of N consecutive bright bins = fish candidate
LIFTOUT_DEPTH_THRESHOLD = 5  # Depth > this metres = boat is in the air
SESSION_GAP_S = 300          # Time gap > this seconds = new scanning session


# ---------- Bathymetry loading ----------

def load_bathymetry(path: str, file_id: int = 0) -> pd.DataFrame:
    """Load a bathymetry/depth_map_data CSV. Auto-detects 4 vs 5 column format."""
    # Peek at first row to determine column count
    with open(path) as f:
        first = f.readline().strip().split(',')
    n_cols = len(first)

    if n_cols == 5:
        names = ['lat', 'lon', 'depth_m', 'temp_c', 'ts_ms']
    elif n_cols == 4:
        names = ['lat', 'lon', 'depth_m', 'ts_ms']
    else:
        raise ValueError(f"Unexpected column count {n_cols} in {path}")

    df = pd.read_csv(path, header=None, names=names)
    if 'temp_c' not in df.columns:
        df['temp_c'] = np.nan

    df['file'] = file_id
    df['has_gps'] = df.lat != 0
    # Prefer GPS-tagged row when timestamps duplicate
    df = df.sort_values(['ts_ms', 'has_gps'], ascending=[True, False])
    df = df.drop_duplicates('ts_ms', keep='first').reset_index(drop=True)
    df['ts'] = pd.to_datetime(df.ts_ms, unit='ms', utc=True)
    return df


def identify_sessions(df: pd.DataFrame) -> pd.DataFrame:
    """Tag rows with a session ID based on time gaps between pings."""
    df = df.sort_values('ts_ms').reset_index(drop=True)
    gap_s = df.ts.diff().dt.total_seconds().fillna(0)
    df['session'] = (gap_s > SESSION_GAP_S).cumsum()
    return df


def flag_liftouts(df: pd.DataFrame) -> pd.DataFrame:
    """
    Detect periods where the boat was out of the water.

    Combines:
      - Hard threshold (depth > 5m where the lake doesn't go that deep)
      - Per-session rolling-median outlier detection (catches gradual descents
        that are too smooth for hard thresholds)

    For lakes deeper than 5m, raise LIFTOUT_DEPTH_THRESHOLD.
    """
    df = df.copy()
    df['liftout'] = df.depth_m > LIFTOUT_DEPTH_THRESHOLD

    for s in sorted(df.session.unique()):
        idx = df[df.session == s].index
        depths = df.loc[idx, 'depth_m'].values
        rolling_med = pd.Series(depths).rolling(31, center=True, min_periods=5).median().values
        deviation = np.abs(depths - rolling_med)
        rolling_mad = pd.Series(deviation).rolling(31, center=True, min_periods=5).median().values
        threshold = rolling_mad * 6 + 0.3
        is_outlier = deviation > threshold
        cur = df.loc[idx, 'liftout'].values
        df.loc[idx, 'liftout'] = cur | is_outlier

    return df


def interpolate_gps(df: pd.DataFrame) -> pd.DataFrame:
    """Linearly interpolate lat/lon for pings that have no GPS fix."""
    df = df.copy()
    df.loc[df.lat == 0, 'lat'] = np.nan
    df.loc[df.lon == 0, 'lon'] = np.nan
    df = df.set_index('ts_ms').sort_index()
    df['lat'] = df['lat'].interpolate(method='index')
    df['lon'] = df['lon'].interpolate(method='index')
    df = df.dropna(subset=['lat', 'lon']).reset_index()
    return df


# ---------- Per-ping sonar analysis ----------

def analyse_ping(vals: np.ndarray, depth_m: float) -> Optional[dict]:
    """
    Analyse a single sonar ping.

    Returns a dict with weed_height_m, fish_count, fish_max_amp,
    hard_bottom_peak, noise_floor — or None if the ping is unusable
    (too few bins, depth too shallow).
    """
    n = len(vals)
    if n < 100:
        return None

    # The bottom is at the very last bins of the array. Find the upper edge of
    # the bottom return: working backwards, find where amplitude drops below 30.
    bottom_edge = n - 1
    for j in range(n - 1, max(RINGDOWN_BINS, n - 200), -1):
        if vals[j] < 30:
            bottom_edge = j
            break
    predicted_bottom = min(int(BINS_PER_M * depth_m), n - 1)
    bottom_edge = min(bottom_edge, predicted_bottom)

    # Hard bottom: peak amplitude in the last 30 bins of the array
    hard_region = vals[max(0, n - 30):]
    hard_bottom_peak = int(hard_region.max())
    hard_bottom_pos = max(0, n - 30) + int(hard_region.argmax())

    # Noise floor: median amplitude in mid-water column
    if n > 300:
        water_zone = vals[RINGDOWN_BINS:max(RINGDOWN_BINS + 50, n - 200)]
        noise_floor = max(int(np.median(water_zone)), 1)
    else:
        noise_floor = 7

    # Weed band: from hard bottom upward, count contiguous bins above weed
    # threshold (allowing small gaps).
    weed_threshold = max(noise_floor * WEED_AMP_FACTOR, WEED_MIN_AMP)
    weed_bins = 0
    consecutive_below = 0
    for j in range(hard_bottom_pos - 1, RINGDOWN_BINS - 1, -1):
        if vals[j] > weed_threshold:
            weed_bins += (consecutive_below + 1)
            consecutive_below = 0
        else:
            consecutive_below += 1
            if consecutive_below > 3:
                break
    weed_height_m = weed_bins / BINS_PER_M

    # Fish: bottom-hugging clusters in the bins just above the weed band but
    # within BOTTOM_HUG_M of the bottom. Look for FISH_MIN_RUN+ consecutive bins
    # at amplitude > FISH_MIN_AMP (and well above local noise).
    bottom_hug_bins = int(BOTTOM_HUG_M * BINS_PER_M)
    weed_top_bin = hard_bottom_pos - weed_bins - 5
    fish_zone_start = max(RINGDOWN_BINS, hard_bottom_pos - bottom_hug_bins)
    fish_zone_end = max(fish_zone_start, weed_top_bin)

    fish_count = 0
    fish_max_amp = 0
    if fish_zone_end > fish_zone_start + 5:
        fz = vals[fish_zone_start:fish_zone_end]
        fish_threshold = max(noise_floor * FISH_AMP_FACTOR, FISH_MIN_AMP)
        in_cluster = False
        cluster_start = 0
        for j in range(len(fz)):
            if fz[j] >= fish_threshold:
                if not in_cluster:
                    cluster_start = j
                    in_cluster = True
            else:
                if in_cluster:
                    if j - cluster_start >= FISH_MIN_RUN:
                        peak = int(fz[cluster_start:j].max())
                        fish_count += 1
                        fish_max_amp = max(fish_max_amp, peak)
                    in_cluster = False
        if in_cluster and len(fz) - cluster_start >= FISH_MIN_RUN:
            peak = int(fz[cluster_start:].max())
            fish_count += 1
            fish_max_amp = max(fish_max_amp, peak)

    return {
        'weed_height_m': weed_height_m,
        'fish_count': fish_count,
        'fish_max_amp': fish_max_amp,
        'hard_bottom_peak': hard_bottom_peak,
        'noise_floor': noise_floor,
    }


def analyse_sonar_file(sonar_path: str, bath_lookup: dict) -> pd.DataFrame:
    """
    Process a sonar.csv file row by row. Returns a DataFrame with one row
    per ping with weed, fish, and bottom-hardness measurements joined to
    GPS coordinates.

    bath_lookup: a dict ts_ms -> (lat, lon, depth_m, temp_c, session, file)
    built from the cleaned bathymetry data.
    """
    rows = []
    with open(sonar_path) as f:
        reader = csv.reader(f)
        for row in reader:
            try:
                ts = int(row[0])
            except (ValueError, IndexError):
                continue
            if ts not in bath_lookup:
                continue
            info = bath_lookup[ts]
            depth = info[2]
            if depth < 0.4:
                continue
            try:
                vals = np.array([int(v) for v in row[1:]], dtype=np.int32)
            except ValueError:
                continue
            result = analyse_ping(vals, depth)
            if result is None:
                continue
            result.update({
                'ts': ts,
                'lat': info[0],
                'lon': info[1],
                'depth_m': depth,
                'temp_c': info[3],
                'session': info[4],
                'file': info[5],
            })
            rows.append(result)
    return pd.DataFrame(rows).drop_duplicates('ts').reset_index(drop=True)


# ---------- Cell-level aggregation ----------

def aggregate_to_cells(df: pd.DataFrame, cell_size_m: float = 2.0) -> pd.DataFrame:
    """
    Project lat/lon to local metres and bucket into a regular grid.

    The grid origin is the SW corner of the data (min lat, min lon).
    Cell coordinates are reported as cx/cy in metres from that origin.
    """
    df = df.copy()
    lat0 = df.lat.min()
    lon0 = df.lon.min()
    df['y_m'] = (df.lat - lat0) * 111000
    df['x_m'] = (df.lon - lon0) * 111000 * np.cos(np.radians(df.lat.mean()))
    df['cx'] = (df.x_m / cell_size_m).round() * cell_size_m
    df['cy'] = (df.y_m / cell_size_m).round() * cell_size_m

    cells = df.groupby(['cx', 'cy']).agg(
        n_pings=('ts', 'count'),
        mean_depth=('depth_m', 'mean'),
        mean_weed=('weed_height_m', 'mean'),
        median_weed=('weed_height_m', 'median'),
        n_fish_pings=('fish_count', lambda x: (x >= 1).sum()),
        fish_rate=('fish_count', lambda x: (x >= 1).mean()),
        total_fish=('fish_count', 'sum'),
        bottom_hardness=('hard_bottom_peak', 'mean'),
    ).reset_index()
    cells = cells[cells.n_pings >= 3]

    # Reverse-project cell centroids to GPS for the front-end
    cells['lat'] = lat0 + cells.cy / 111000
    cells['lon'] = lon0 + cells.cx / (111000 * np.cos(np.radians(df.lat.mean())))
    return cells


def categorise_cells(cells: pd.DataFrame) -> pd.DataFrame:
    """Tag each cell as gold / silver / bronze / weeded / none."""
    cells = cells.copy()
    cells['category'] = 'none'
    gold = (cells.fish_rate >= 0.10) & (cells.mean_weed <= 0.05)
    silver = (cells.fish_rate >= 0.10) & (cells.mean_weed > 0.05) & (cells.mean_weed <= 0.15) & ~gold
    bronze = (cells.fish_rate >= 0.05) & (cells.fish_rate < 0.10) & (cells.mean_weed <= 0.15)
    weeded = (cells.fish_rate >= 0.10) & (cells.mean_weed > 0.15)
    cells.loc[gold, 'category'] = 'gold'
    cells.loc[silver, 'category'] = 'silver'
    cells.loc[bronze, 'category'] = 'bronze'
    cells.loc[weeded, 'category'] = 'weeded'
    return cells


# ---------- Top-level entry point ----------

def process_scan(bathymetry_paths: list, sonar_paths: list) -> dict:
    """
    Full pipeline. Pass parallel lists of bathymetry and sonar file paths
    (one entry per scan file). Returns a dict with three DataFrames:
        bathymetry: cleaned per-ping bathymetry
        pings:      per-ping fish/weed/hardness analysis
        cells:      grid-aggregated, categorised cells (the main UI output)
    """
    assert len(bathymetry_paths) == len(sonar_paths)
    baths = [load_bathymetry(p, file_id=i) for i, p in enumerate(bathymetry_paths)]
    bath = pd.concat(baths, ignore_index=True)
    bath = identify_sessions(bath)
    bath = flag_liftouts(bath)
    bath = bath[~bath.liftout].copy()
    bath = interpolate_gps(bath)

    bath_lookup = {
        int(r.ts_ms): (r.lat, r.lon, r.depth_m, r.temp_c, int(r.session), int(r.file))
        for _, r in bath.iterrows()
    }

    pings_dfs = [analyse_sonar_file(sp, bath_lookup) for sp in sonar_paths]
    pings = pd.concat(pings_dfs, ignore_index=True).drop_duplicates('ts')

    cells = aggregate_to_cells(pings)
    cells = categorise_cells(cells)

    return {'bathymetry': bath, 'pings': pings, 'cells': cells}


if __name__ == '__main__':
    import sys
    # Quick smoke test:
    # python deeper_analysis.py bath1.csv sonar1.csv [bath2.csv sonar2.csv ...]
    args = sys.argv[1:]
    bath_paths = args[0::2]
    sonar_paths = args[1::2]
    result = process_scan(bath_paths, sonar_paths)
    print(f"Bathymetry: {len(result['bathymetry'])} clean pings")
    print(f"Pings analysed: {len(result['pings'])}")
    print(f"Cells: {len(result['cells'])}")
    print(f"Cell categories: {result['cells'].category.value_counts().to_dict()}")
