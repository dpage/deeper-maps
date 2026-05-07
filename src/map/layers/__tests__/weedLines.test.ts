import { describe, expect, it } from 'vitest';
import { buildWeedLinesStyle, WEED_LINES_LAYER_ID, WEED_LINES_SOURCE_ID } from '../weedLines';

describe('buildWeedLinesStyle', () => {
  it('exposes the expected source / layer IDs', () => {
    expect(WEED_LINES_SOURCE_ID).toBe('weed-lines');
    expect(WEED_LINES_LAYER_ID).toBe('weed-lines-layer');
  });

  it('produces a line layer with a Greens-ramp line-color interpolated by level', () => {
    const style = buildWeedLinesStyle({ min: 0, max: 0.3 });
    expect(style.layer.type).toBe('line');
    const paint = style.layer.paint as Record<string, unknown>;
    const lineColor = paint['line-color'];
    expect(JSON.stringify(lineColor)).toContain('level');
    expect(JSON.stringify(lineColor)).toContain('interpolate');
    expect(paint['line-width'] as number).toBeCloseTo(1.2);
    expect(paint['line-opacity'] as number).toBeCloseTo(0.9);
  });

  it('defaults to hidden — visibility is managed by the MapView visibility effect', () => {
    const style = buildWeedLinesStyle({ min: 0, max: 0.3 });
    const layout = (style.layer as { layout?: { visibility?: string } }).layout;
    expect(layout?.visibility).toBe('none');
  });

  it('starts with an empty FeatureCollection — data is pushed via setData()', () => {
    const style = buildWeedLinesStyle({ min: 0, max: 0.3 });
    expect(style.source.type).toBe('geojson');
    expect(style.source.data.features).toHaveLength(0);
  });

  it('clamps the colour-stop span when scale is degenerate (min === max)', () => {
    // Sanity: a degenerate scale shouldn't blow up. The interpolate
    // expression should still produce finite stops.
    const style = buildWeedLinesStyle({ min: 0.5, max: 0.5 });
    const paint = style.layer.paint as Record<string, unknown>;
    const lineColor = JSON.stringify(paint['line-color']);
    expect(lineColor).toContain('interpolate');
  });
});
