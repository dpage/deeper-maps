import { describe, expect, it } from 'vitest';
import { makePing } from '../../../../test/fixtures/makeSonar';
import { DEFAULT_SONAR_OPTIONS } from '../../constants';
import type { CleanBathRow } from '../../types';
import { analyseSinglePing, analysePings } from '../analysePings';

const bath = (ts: number, depth: number): CleanBathRow => ({
  ts_ms: ts,
  lat: 51.7,
  lon: -1.43,
  depth_m: depth,
  session_id: 0,
  file_id: 0,
});

describe('analyseSinglePing', () => {
  it('returns null for too-short pings', () => {
    const tiny = { ts_ms: 0, amps: new Int32Array(50) };
    expect(analyseSinglePing(tiny, 1.5, DEFAULT_SONAR_OPTIONS)).toBeNull();
  });

  it('returns weed_height_m=0 on a clean (no weed) bottom', () => {
    const ping = makePing({ ts: 0, bins: 600, bottomBins: 10, bottomAmp: 1500 });
    const res = analyseSinglePing(ping, 1.0, DEFAULT_SONAR_OPTIONS);
    expect(res?.weed_height_m).toBe(0);
    expect(res?.fish_count).toBe(0);
  });

  it('detects a weed band height in metres', () => {
    const ping = makePing({
      ts: 0,
      bins: 600,
      bottomBins: 5,
      weed: { runLength: 60, amp: 200 },
    });
    const res = analyseSinglePing(ping, 1.0, DEFAULT_SONAR_OPTIONS);
    expect(res?.weed_height_m).toBeGreaterThan(0.05);
  });

  it('detects a single fish cluster within the bottom-hug zone', () => {
    const ping = makePing({
      ts: 0,
      bins: 600,
      bottomBins: 5,
      fish: { binsAboveBottom: 30, runLength: 5, amp: 800 },
    });
    const res = analyseSinglePing(ping, 1.0, DEFAULT_SONAR_OPTIONS);
    expect(res?.fish_count).toBe(1);
    expect(res?.fish_max_amp).toBeGreaterThanOrEqual(800);
  });

  it('does not detect a mid-water echo as fish (outside bottom-hug zone)', () => {
    const ping = makePing({
      ts: 0,
      bins: 600,
      bottomBins: 5,
      fish: { binsAboveBottom: 400, runLength: 5, amp: 800 },
    });
    const res = analyseSinglePing(ping, 1.0, DEFAULT_SONAR_OPTIONS);
    expect(res?.fish_count).toBe(0);
  });

  it('uses fallback noise floor for short pings (<= 300 bins) and counts fish at zone edge', () => {
    // n in (100, 300] forces the noiseFloor=7 fallback branch. Place a fish
    // cluster that runs to the very end of the fish zone so the
    // cluster-at-end-of-zone branch fires.
    const opts = DEFAULT_SONAR_OPTIONS;
    const bins = 200;
    const amps = new Int32Array(bins);
    // Ringdown.
    for (let i = 0; i < Math.min(opts.ringdownBins, bins); i++) amps[i] = 1500;
    // Mid-water noise.
    for (let i = opts.ringdownBins; i < bins; i++) amps[i] = 5;
    // Single hard bottom peak at the very last bin.
    amps[bins - 1] = 1500;
    // Now hardBottomPos = bins - 1 = 199, weedBins = 0.
    // weedTopBin = 199 - 0 - 5 = 194.
    // bottomHugBins = floor(0.25 * 576.6) = 144.
    // fishZoneStart = max(30, 199 - 144) = 55.
    // fishZoneEnd = max(55, 194) = 194.
    // Fill the fish zone with fish-amplitude bins so the cluster is still
    // open at fishZoneEnd, exercising the end-of-zone branch.
    for (let i = 55; i < 194; i++) amps[i] = 800;
    const res = analyseSinglePing({ ts_ms: 0, amps }, 0.5, opts);
    expect(res?.noise_floor).toBe(7);
    expect(res?.fish_count).toBeGreaterThanOrEqual(1);
  });

  it('matches numpy median (avg-of-middles, then int) for even-length noise slices', () => {
    // n > 300 so the noise-floor branch runs over a real water_zone slice.
    // water_zone = vals[ringdownBins..max(ringdownBins+50, n-200)] = vals[30..400] (length 370 — odd).
    // We need an even-length slice to hit the avg-of-middles branch, so set bins = 460
    // → water_zone = vals[30..max(80, 260)] = vals[30..260] (length 230 — even).
    const bins = 460;
    const amps = new Int32Array(bins);
    // Ringdown 0..29
    for (let i = 0; i < 30; i++) amps[i] = 1500;
    // Mid-water column 30..259: alternate 5 and 8, so sorted middles are 5 and 8 → avg 6.5 → trunc 6.
    // (115 fives and 115 eights → sorted, the two middles at positions 114 and 115 are 5 and 8.)
    for (let i = 30; i < 260; i++) amps[i] = i % 2 === 0 ? 5 : 8;
    // Fill 260..454 with low amplitude (post-water-zone, pre-bottom).
    for (let i = 260; i < bins - 5; i++) amps[i] = 5;
    // Bottom in last 5 bins.
    for (let i = bins - 5; i < bins; i++) amps[i] = 1500;
    const ping = { ts_ms: 0, amps };
    const res = analyseSinglePing(ping, 1.0, DEFAULT_SONAR_OPTIONS);
    expect(res).not.toBeNull();
    // The whole point: numpy.median of [5,5,...,8,8,...] (sorted: 115 fives then 115 eights)
    // = (5 + 8) / 2 = 6.5; int(6.5) = 6. The old upper-median code would have returned 8.
    expect(res?.noise_floor).toBe(6);
  });

  it('matches numpy median for odd-length noise slices (picks the middle)', () => {
    // bins = 600 → water_zone = vals[30..max(80, 400)] = vals[30..400] (length 370 — wait, even).
    // Use bins = 461 → water_zone = vals[30..max(80, 261)] = vals[30..261] (length 231 — odd).
    const bins = 461;
    const amps = new Int32Array(bins);
    for (let i = 0; i < 30; i++) amps[i] = 1500;
    // Mid-water 30..260 (231 bins). Set values so the sorted middle is exactly 7.
    // 115 below (=5), 1 middle (=7), 115 above (=9). Sorted middle index = 115 → value 7.
    for (let i = 30; i < 145; i++) amps[i] = 5;
    amps[145] = 7;
    for (let i = 146; i < 261; i++) amps[i] = 9;
    for (let i = 261; i < bins - 5; i++) amps[i] = 5;
    for (let i = bins - 5; i < bins; i++) amps[i] = 1500;
    const res = analyseSinglePing({ ts_ms: 0, amps }, 1.0, DEFAULT_SONAR_OPTIONS);
    expect(res?.noise_floor).toBe(7);
  });
});

describe('analysePings (per-file aggregation)', () => {
  it('joins each ping to its bathymetry row by ts_ms', () => {
    const sonar = [
      makePing({ ts: 100, bins: 600, bottomBins: 5 }),
      makePing({ ts: 200, bins: 600, bottomBins: 5 }),
      makePing({ ts: 300, bins: 600, bottomBins: 5 }),
    ];
    const baths = [bath(100, 1.0), bath(200, 1.0), bath(300, 1.0)];
    const result = analysePings(sonar, baths, DEFAULT_SONAR_OPTIONS);
    expect(result.rows).toHaveLength(3);
    expect(result.rows.map((r) => r.ts_ms).sort()).toEqual([100, 200, 300]);
  });

  it('drops a sonar ping with no matching bathymetry row', () => {
    const sonar = [
      makePing({ ts: 100, bins: 600, bottomBins: 5 }),
      makePing({ ts: 999_999, bins: 600, bottomBins: 5 }),
    ];
    const baths = [bath(100, 1.0)];
    const result = analysePings(sonar, baths, DEFAULT_SONAR_OPTIONS);
    expect(result.rows).toHaveLength(1);
  });

  it('drops a ping where depth is too shallow (< 0.4 m)', () => {
    const sonar = [makePing({ ts: 100, bins: 600, bottomBins: 5 })];
    const baths = [bath(100, 0.2)];
    const result = analysePings(sonar, baths, DEFAULT_SONAR_OPTIONS);
    expect(result.rows).toHaveLength(0);
  });
});
