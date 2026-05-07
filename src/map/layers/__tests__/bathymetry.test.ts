import { describe, expect, it } from 'vitest';
import { BATHYMETRY_LAYER_ID, BATHYMETRY_SOURCE_ID, buildBathymetryStyle } from '../bathymetry';

describe('buildBathymetryStyle', () => {
  it('exports stable source/layer ids', () => {
    expect(BATHYMETRY_SOURCE_ID).toBe('bathymetry');
    expect(BATHYMETRY_LAYER_ID).toBe('bathymetry-fill');
  });

  it('returns a fill layer with an interpolate paint expression bound to scale', () => {
    const style = buildBathymetryStyle({ min: 1.0, max: 3.0, levels: [1.0, 2.0, 3.0] });
    expect(style.layer.type).toBe('fill');
    expect((style.layer as { source: string }).source).toBe(BATHYMETRY_SOURCE_ID);
    const fillColor = (style.layer.paint as Record<string, unknown>)['fill-color'];
    expect(Array.isArray(fillColor)).toBe(true);
    if (Array.isArray(fillColor)) {
      expect(fillColor[0]).toBe('interpolate');
      // Argument 1 is interpolation type (linear); 2 is input expression.
      expect(JSON.stringify(fillColor)).toContain('level');
    }
  });

  it('ignores degenerate scale (empty levels) without crashing', () => {
    const style = buildBathymetryStyle({ min: 1, max: 1, levels: [] });
    expect(style).toBeDefined();
  });
});
