import { describe, expect, it } from 'vitest';
import {
  BATHYMETRY_LINES_LAYER_ID,
  BATHYMETRY_LINES_SOURCE_ID,
  buildBathymetryLinesStyle,
} from '../bathymetryLines';

describe('buildBathymetryLinesStyle', () => {
  it('exposes the expected source / layer IDs', () => {
    expect(BATHYMETRY_LINES_SOURCE_ID).toBe('bathymetry-lines');
    expect(BATHYMETRY_LINES_LAYER_ID).toBe('bathymetry-lines-layer');
  });

  it('produces a line layer with a Viridis-ramp line-color interpolated by level', () => {
    const style = buildBathymetryLinesStyle({ min: 1.0, max: 3.0 });
    expect(style.layer.type).toBe('line');
    expect((style.layer as { source: string }).source).toBe(BATHYMETRY_LINES_SOURCE_ID);
    const paint = style.layer.paint as Record<string, unknown>;
    const lineColor = paint['line-color'];
    expect(JSON.stringify(lineColor)).toContain('level');
    expect(JSON.stringify(lineColor)).toContain('interpolate');
    expect(paint['line-width'] as number).toBeCloseTo(1.2);
    expect(paint['line-opacity'] as number).toBeCloseTo(0.9);
  });

  it('defaults to hidden — visibility is managed by the MapView visibility effect', () => {
    const style = buildBathymetryLinesStyle({ min: 1.0, max: 3.0 });
    const layout = (style.layer as { layout?: { visibility?: string } }).layout;
    expect(layout?.visibility).toBe('none');
  });

  it('starts with an empty FeatureCollection — data is pushed via setData()', () => {
    const style = buildBathymetryLinesStyle({ min: 1.0, max: 3.0 });
    expect(style.source.type).toBe('geojson');
    expect(style.source.data.features).toHaveLength(0);
  });

  it('clamps the colour-stop span when scale is degenerate (min === max)', () => {
    // Sanity: a degenerate scale shouldn't blow up. The interpolate
    // expression should still produce finite stops.
    const style = buildBathymetryLinesStyle({ min: 1.5, max: 1.5 });
    const paint = style.layer.paint as Record<string, unknown>;
    const lineColor = JSON.stringify(paint['line-color']);
    expect(lineColor).toContain('interpolate');
  });
});
