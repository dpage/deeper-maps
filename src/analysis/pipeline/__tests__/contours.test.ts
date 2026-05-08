import { describe, expect, it } from 'vitest';
import { buildContourFeatures, toExclusiveBands } from '../contours';
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

describe('toExclusiveBands', () => {
  it('returns empty FC for empty input', () => {
    const out = toExclusiveBands({ type: 'FeatureCollection', features: [] });
    expect(out.features).toHaveLength(0);
  });

  it('passes through a single feature unchanged', () => {
    const single = {
      type: 'FeatureCollection' as const,
      features: [
        {
          type: 'Feature' as const,
          geometry: {
            type: 'MultiPolygon' as const,
            coordinates: [[[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]]],
          },
          properties: { level: 1 },
        },
      ],
    };
    const out = toExclusiveBands(single);
    expect(out.features).toHaveLength(1);
    expect(out.features[0]?.properties.level).toBe(1);
  });

  it('subtracts a smaller nested polygon from a larger one (outer becomes a ring with hole)', () => {
    const fc = {
      type: 'FeatureCollection' as const,
      features: [
        {
          type: 'Feature' as const,
          geometry: {
            type: 'MultiPolygon' as const,
            coordinates: [[[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]]],
          },
          properties: { level: 1 },
        },
        {
          type: 'Feature' as const,
          geometry: {
            type: 'MultiPolygon' as const,
            coordinates: [[[[3, 3], [7, 3], [7, 7], [3, 7], [3, 3]]]],
          },
          properties: { level: 2 },
        },
      ],
    };
    const out = toExclusiveBands(fc);
    expect(out.features).toHaveLength(2);

    // Outer polygon at level=1 should now have a hole punched in it.
    const outer = out.features.find((f) => f.properties.level === 1)!;
    // polygon-clipping produces a polygon with outer ring + hole ring
    expect(outer.geometry.coordinates[0]?.length).toBeGreaterThanOrEqual(2);

    // Inner polygon at level=2 should be unchanged (5 points: 4 corners + close)
    const inner = out.features.find((f) => f.properties.level === 2)!;
    expect(inner.geometry.coordinates[0]?.[0]?.length).toBe(5);
  });

  it('handles three nested levels — each except innermost gets a hole', () => {
    const box = (a: number, b: number) =>
      [[[[ a, a], [b, a], [b, b], [a, b], [a, a]]]];

    const fc = {
      type: 'FeatureCollection' as const,
      features: [
        {
          type: 'Feature' as const,
          geometry: { type: 'MultiPolygon' as const, coordinates: box(0, 10) },
          properties: { level: 1 },
        },
        {
          type: 'Feature' as const,
          geometry: { type: 'MultiPolygon' as const, coordinates: box(2, 8) },
          properties: { level: 2 },
        },
        {
          type: 'Feature' as const,
          geometry: { type: 'MultiPolygon' as const, coordinates: box(4, 6) },
          properties: { level: 3 },
        },
      ],
    };
    const out = toExclusiveBands(fc);
    expect(out.features).toHaveLength(3);

    // Level 1 and 2 should each have a hole; level 3 (innermost) stays as-is.
    const f1 = out.features.find((f) => f.properties.level === 1)!;
    const f2 = out.features.find((f) => f.properties.level === 2)!;
    const f3 = out.features.find((f) => f.properties.level === 3)!;

    expect(f1.geometry.coordinates[0]?.length).toBeGreaterThanOrEqual(2);
    expect(f2.geometry.coordinates[0]?.length).toBeGreaterThanOrEqual(2);
    // Innermost polygon unchanged: one ring, 5 points
    expect(f3.geometry.coordinates[0]?.[0]?.length).toBe(5);
  });
});
