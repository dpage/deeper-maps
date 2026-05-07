import { describe, expect, it } from 'vitest';
import { buildContourFeatures } from '../contours';
import type { IdwGrid } from '../grid';

function flatGrid(width: number, height: number, value: number): IdwGrid {
  const values = new Float64Array(width * height);
  values.fill(value);
  return { width, height, cellSize: 1, origin: { x: 0, y: 0 }, values };
}

function rampGrid(width: number, height: number): IdwGrid {
  const values = new Float64Array(width * height);
  for (let i = 0; i < values.length; i++) values[i] = i / values.length;
  return { width, height, cellSize: 1, origin: { x: 0, y: 0 }, values };
}

describe('buildContourFeatures', () => {
  it('produces a MultiPolygon feature per level', () => {
    const grid = rampGrid(8, 8);
    const fc = buildContourFeatures(grid, [0.2, 0.4, 0.6, 0.8]);
    expect(fc.type).toBe('FeatureCollection');
    expect(fc.features).toHaveLength(4);
    for (const f of fc.features) {
      expect(f.type).toBe('Feature');
      expect(f.geometry.type).toBe('MultiPolygon');
      expect(typeof f.properties?.level).toBe('number');
    }
  });

  it('returns an empty FeatureCollection for a flat grid that never crosses any threshold', () => {
    const grid = flatGrid(4, 4, 0);
    const fc = buildContourFeatures(grid, [1, 2, 3]);
    expect(fc.features.every((f) => f.geometry.type === 'MultiPolygon')).toBe(true);
    // d3-contour produces empty MultiPolygons; confirm no coords without crashing.
    for (const f of fc.features) {
      expect(f.geometry.type).toBe('MultiPolygon');
      if (f.geometry.type === 'MultiPolygon') {
        expect(f.geometry.coordinates).toEqual([]);
      }
    }
  });

  it('preserves the level value in feature properties', () => {
    const fc = buildContourFeatures(rampGrid(4, 4), [0.25, 0.75]);
    expect(fc.features.map((f) => f.properties?.level)).toEqual([0.25, 0.75]);
  });
});
