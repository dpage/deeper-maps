import type { SonarPing } from '../parsers/types';
import type { CleanBathRow, PerPing, PerPingRow, SonarOptions } from '../types';

const MIN_USEFUL_BINS = 100;
const MIN_USEFUL_DEPTH_M = 0.4;

interface PingAnalysis {
  weed_height_m: number;
  fish_count: number;
  fish_max_amp: number;
  hard_bottom_peak: number;
  noise_floor: number;
}

export function analyseSinglePing(
  ping: SonarPing,
  _depth_m: number,
  opts: SonarOptions,
): PingAnalysis | null {
  const vals = ping.amps;
  const n = vals.length;
  if (n < MIN_USEFUL_BINS) return null;

  // Hard bottom: peak in last 30 bins.
  const hardStart = Math.max(0, n - 30);
  let hardBottomPeak = 0;
  let hardBottomPos = hardStart;
  for (let j = hardStart; j < n; j++) {
    if (vals[j]! > hardBottomPeak) {
      hardBottomPeak = vals[j]!;
      hardBottomPos = j;
    }
  }

  // Noise floor: median of mid-water column.
  let noiseFloor: number;
  if (n > 300) {
    const lo = opts.ringdownBins;
    const hi = Math.max(opts.ringdownBins + 50, n - 200);
    // hi = max(ringdownBins + 50, n - 200) ≥ ringdownBins + 50 > lo, so slice length ≥ 50.
    const slice = Array.from(vals.slice(lo, hi));
    slice.sort((a, b) => a - b);
    const len = slice.length;
    // numpy.median: for even-length input, average the two middles; Python's
    // int(...) wrapper truncates toward zero. Match exactly to keep equivalent
    // behaviour vs deeper_analysis.py:179.
    const m =
      len % 2 === 0
        ? Math.trunc((slice[(len >> 1) - 1]! + slice[len >> 1]!) / 2)
        : slice[len >> 1]!;
    noiseFloor = Math.max(m, 1);
  } else {
    noiseFloor = 7;
  }

  // Weed band: walk up from hard bottom while amplitude > weed threshold.
  const weedThreshold = Math.max(noiseFloor * opts.weedAmpFactor, opts.weedMinAmp);
  let weedBins = 0;
  let consecutiveBelow = 0;
  for (let j = hardBottomPos - 1; j >= opts.ringdownBins; j--) {
    if (vals[j]! > weedThreshold) {
      weedBins += consecutiveBelow + 1;
      consecutiveBelow = 0;
    } else {
      consecutiveBelow++;
      if (consecutiveBelow > 3) break;
    }
  }
  const weed_height_m = weedBins / opts.binsPerM;

  // Fish: bottom-hug zone, above weed, below bottom.
  const bottomHugBins = Math.floor(opts.bottomHugM * opts.binsPerM);
  const weedTopBin = hardBottomPos - weedBins - 5;
  const fishZoneStart = Math.max(opts.ringdownBins, hardBottomPos - bottomHugBins);
  const fishZoneEnd = Math.max(fishZoneStart, weedTopBin);

  let fish_count = 0;
  let fish_max_amp = 0;
  if (fishZoneEnd > fishZoneStart + 5) {
    const fishThreshold = Math.max(noiseFloor * opts.fishAmpFactor, opts.fishMinAmp);
    let inCluster = false;
    let clusterStart = 0;
    for (let j = fishZoneStart; j < fishZoneEnd; j++) {
      if (vals[j]! >= fishThreshold) {
        if (!inCluster) {
          clusterStart = j;
          inCluster = true;
        }
      } else if (inCluster) {
        if (j - clusterStart >= opts.fishMinRun) {
          let peak = 0;
          for (let k = clusterStart; k < j; k++) if (vals[k]! > peak) peak = vals[k]!;
          fish_count++;
          if (peak > fish_max_amp) fish_max_amp = peak;
        }
        inCluster = false;
      }
    }
    if (inCluster && fishZoneEnd - clusterStart >= opts.fishMinRun) {
      let peak = 0;
      for (let k = clusterStart; k < fishZoneEnd; k++) if (vals[k]! > peak) peak = vals[k]!;
      fish_count++;
      if (peak > fish_max_amp) fish_max_amp = peak;
    }
  }

  return {
    weed_height_m,
    fish_count,
    fish_max_amp,
    hard_bottom_peak: hardBottomPeak,
    noise_floor: noiseFloor,
  };
}

export function analysePings(
  sonar: readonly SonarPing[],
  bathymetry: readonly CleanBathRow[],
  opts: SonarOptions,
): PerPing {
  const bathByTs = new Map<number, CleanBathRow>();
  for (const r of bathymetry) bathByTs.set(r.ts_ms, r);

  const rows: PerPingRow[] = [];
  const seen = new Set<number>();
  for (const ping of sonar) {
    if (seen.has(ping.ts_ms)) continue;
    const bath = bathByTs.get(ping.ts_ms);
    if (!bath) continue;
    if (bath.depth_m < MIN_USEFUL_DEPTH_M) continue;
    const result = analyseSinglePing(ping, bath.depth_m, opts);
    if (!result) continue;
    seen.add(ping.ts_ms);
    const row: PerPingRow = {
      ts_ms: ping.ts_ms,
      lat: bath.lat,
      lon: bath.lon,
      depth_m: bath.depth_m,
      weed_height_m: result.weed_height_m,
      fish_count: result.fish_count,
      fish_max_amp: result.fish_max_amp,
      hard_bottom_peak: result.hard_bottom_peak,
      noise_floor: result.noise_floor,
      session_id: bath.session_id,
    };
    if (bath.temp_c !== undefined) row.temp_c = bath.temp_c;
    rows.push(row);
  }
  return { rows };
}
