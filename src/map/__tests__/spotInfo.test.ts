import type { Feature, Point } from 'geojson';
import { describe, expect, it } from 'vitest';
import {
  findNearestSpot,
  formatScanTime,
  formatSpotPopupHtml,
  spotDistanceMeters,
  type SpotProperties,
} from '../spotInfo';

function pt(lon: number, lat: number, id: string): Feature<Point> {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [lon, lat] },
    properties: { id },
  };
}

// Deterministic formatter so date assertions don't depend on the host locale.
const fmt = (ms: number): string => `T${ms}`;

describe('findNearestSpot', () => {
  it('returns the geographically nearest feature', () => {
    const feats = [pt(0, 0, 'a'), pt(1, 1, 'b'), pt(0.1, 0.1, 'c')];
    const nearest = findNearestSpot(feats, 0.09, 0.09);
    expect(nearest?.properties?.id).toBe('c');
  });

  it('returns null for an empty list', () => {
    expect(findNearestSpot([], 0, 0)).toBeNull();
  });

  it('skips features with missing coordinates', () => {
    const broken: Feature<Point> = {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [] },
      properties: { id: 'broken' },
    };
    const nearest = findNearestSpot([broken, pt(5, 5, 'ok')], 5, 5);
    expect(nearest?.properties?.id).toBe('ok');
  });
});

describe('spotDistanceMeters', () => {
  it('is ~0 for a coincident point', () => {
    expect(spotDistanceMeters(pt(-1.43, 51.7, 'a'), -1.43, 51.7)).toBeCloseTo(0, 5);
  });

  it('measures ~111 m for 0.001° of latitude', () => {
    expect(spotDistanceMeters(pt(-1.43, 51.701, 'a'), -1.43, 51.7)).toBeCloseTo(111, 0);
  });

  it('returns Infinity for a feature with missing coordinates', () => {
    const broken: Feature<Point> = {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [] },
      properties: {},
    };
    expect(spotDistanceMeters(broken, 0, 0)).toBe(Infinity);
  });
});

describe('formatScanTime', () => {
  it('returns null when there is no start timestamp', () => {
    expect(formatScanTime(undefined, undefined, fmt)).toBeNull();
  });

  it('returns a single time when the span is under a minute', () => {
    expect(formatScanTime(1000, 1000 + 5000, fmt)).toBe('T1000');
  });

  it('returns a range when the span exceeds a minute', () => {
    expect(formatScanTime(1000, 1000 + 120_000, fmt)).toBe('T1000 – T121000');
  });

  it('collapses to a single time when formatted start and end are identical', () => {
    const constant = (): string => 'SAME';
    expect(formatScanTime(1000, 999_999_999, constant)).toBe('SAME');
  });

  it('uses the default (locale) formatter when none is supplied', () => {
    const out = formatScanTime(1717000000000, undefined);
    expect(typeof out).toBe('string');
    expect(out).toMatch(/\d/); // contains at least one digit
  });
});

describe('formatSpotPopupHtml', () => {
  const base: SpotProperties = {
    depth_m: 2.34,
    mean_weed: 0.156,
    fish_rate: 0.25,
    n_pings: 7,
    temp_c: 18.42,
    t_start_ms: 1000,
    t_end_ms: 1000,
    category: 'gold',
  };

  it('includes depth, temp, weed, fish rate, samples, scanned time and tier', () => {
    const html = formatSpotPopupHtml(base, fmt);
    expect(html).toContain('Depth');
    expect(html).toContain('2.3 m');
    expect(html).toContain('18.4 °C');
    expect(html).toContain('0.16 m');
    expect(html).toContain('25%');
    expect(html).toContain('Samples');
    expect(html).toContain('7');
    expect(html).toContain('T1000');
    expect(html).toContain('Gold');
  });

  it('omits the water-temp row when temperature is absent', () => {
    const noTemp = { ...base };
    delete noTemp.temp_c;
    const html = formatSpotPopupHtml(noTemp, fmt);
    expect(html).not.toContain('Water temp');
  });

  it('omits the sweet-spot row for uncategorised spots', () => {
    const html = formatSpotPopupHtml({ ...base, category: 'none' }, fmt);
    expect(html).not.toContain('Sweet spot');
  });

  it('omits the scanned row when there is no timestamp', () => {
    const noTime = { ...base };
    delete noTime.t_start_ms;
    delete noTime.t_end_ms;
    const html = formatSpotPopupHtml(noTime, fmt);
    expect(html).not.toContain('Scanned');
  });

  it('omits weed and fish rows for a depth/temperature-only (sonar-less) spot', () => {
    const noSonar = { ...base };
    delete noSonar.mean_weed;
    delete noSonar.fish_rate;
    const html = formatSpotPopupHtml(noSonar, fmt);
    expect(html).not.toContain('Weed');
    expect(html).not.toContain('Fish rate');
    // Depth, temp and samples still show.
    expect(html).toContain('Depth');
    expect(html).toContain('Water temp');
    expect(html).toContain('Samples');
  });
});
