import type { Feature, FeatureCollection, Point } from 'geojson';
import { describe, expect, it } from 'vitest';
import {
  buildSweetSpotsStyle,
  selectTopSweetSpots,
  SWEET_SPOTS_LAYER_ID,
  SWEET_SPOTS_SOURCE_ID,
  type SweetSpotViewport,
} from '../sweetSpots';

describe('buildSweetSpotsStyle', () => {
  it('returns a categorical-colour circle layer', () => {
    const style = buildSweetSpotsStyle();
    expect(SWEET_SPOTS_SOURCE_ID).toBe('sweet-spots');
    expect(SWEET_SPOTS_LAYER_ID).toBe('sweet-spots-circles');
    expect(style.layer.type).toBe('circle');
    const paint = style.layer.paint as Record<string, unknown>;
    expect(JSON.stringify(paint['circle-color'])).toContain('color');
    expect(paint['circle-opacity'] as number).toBe(1);
    expect(paint['circle-stroke-color'] as string).toBe('#ffffff');
  });
});

interface SpotProps {
  category: string;
  fish_rate?: number;
  mean_weed?: number;
  n_pings?: number;
  id?: string;
}

function spot(lon: number, lat: number, props: SpotProps): Feature<Point, SpotProps> {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [lon, lat] },
    properties: props,
  };
}

function fc(features: Feature[]): FeatureCollection {
  return { type: 'FeatureCollection', features };
}

// A generous viewport covering all test coordinates unless a test narrows it.
const WORLD: SweetSpotViewport = { west: -10, south: -10, east: 10, north: 10 };

function ids(result: FeatureCollection): (string | undefined)[] {
  return result.features.map((f) => (f.properties as SpotProps | null)?.id);
}

describe('selectTopSweetSpots', () => {
  it('ranks best category first: gold → silver → bronze → weeded', () => {
    const input = fc([
      spot(0, 0, { category: 'weeded', id: 'w' }),
      spot(0, 0, { category: 'bronze', id: 'b' }),
      spot(0, 0, { category: 'gold', id: 'g' }),
      spot(0, 0, { category: 'silver', id: 's' }),
    ]);
    expect(ids(selectTopSweetSpots(input, WORLD, 10))).toEqual(['g', 's', 'b', 'w']);
  });

  it('within a category, higher fish-rate ranks first', () => {
    const input = fc([
      spot(0, 0, { category: 'gold', fish_rate: 0.1, id: 'lo' }),
      spot(0, 0, { category: 'gold', fish_rate: 0.4, id: 'hi' }),
      spot(0, 0, { category: 'gold', fish_rate: 0.25, id: 'mid' }),
    ]);
    expect(ids(selectTopSweetSpots(input, WORLD, 10))).toEqual(['hi', 'mid', 'lo']);
  });

  it('breaks fish-rate ties by less weed, then more pings', () => {
    const input = fc([
      spot(0, 0, { category: 'gold', fish_rate: 0.2, mean_weed: 0.1, n_pings: 5, id: 'weedy' }),
      spot(0, 0, {
        category: 'gold',
        fish_rate: 0.2,
        mean_weed: 0.02,
        n_pings: 3,
        id: 'clean-few',
      }),
      spot(0, 0, {
        category: 'gold',
        fish_rate: 0.2,
        mean_weed: 0.02,
        n_pings: 9,
        id: 'clean-many',
      }),
    ]);
    expect(ids(selectTopSweetSpots(input, WORLD, 10))).toEqual([
      'clean-many',
      'clean-few',
      'weedy',
    ]);
  });

  it('drops spots outside the viewport', () => {
    const input = fc([
      spot(0, 0, { category: 'gold', id: 'in' }),
      spot(50, 50, { category: 'gold', id: 'out' }),
    ]);
    const viewport: SweetSpotViewport = { west: -1, south: -1, east: 1, north: 1 };
    expect(ids(selectTopSweetSpots(input, viewport, 10))).toEqual(['in']);
  });

  it('caps the result at the limit (best-first)', () => {
    const input = fc([
      spot(0, 0, { category: 'gold', fish_rate: 0.5, id: 'a' }),
      spot(0, 0, { category: 'gold', fish_rate: 0.4, id: 'b' }),
      spot(0, 0, { category: 'silver', fish_rate: 0.9, id: 'c' }),
    ]);
    expect(ids(selectTopSweetSpots(input, WORLD, 2))).toEqual(['a', 'b']);
  });

  it('returns an empty collection when limit <= 0', () => {
    const input = fc([spot(0, 0, { category: 'gold', id: 'a' })]);
    expect(selectTopSweetSpots(input, WORLD, 0).features).toEqual([]);
  });

  it('ignores non-Point features and sorts unknown categories last', () => {
    const line: Feature = {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [
          [0, 0],
          [1, 1],
        ],
      },
      properties: { category: 'gold', id: 'line' },
    };
    const input = fc([
      spot(0, 0, { category: 'mystery', id: 'unknown' }),
      spot(0, 0, { category: 'gold', id: 'gold' }),
      line,
    ]);
    expect(ids(selectTopSweetSpots(input, WORLD, 10))).toEqual(['gold', 'unknown']);
  });
});
