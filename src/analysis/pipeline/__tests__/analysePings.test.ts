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
