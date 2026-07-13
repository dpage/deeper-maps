import { describe, expect, it } from 'vitest';
import {
  buildFishDensityStyle,
  buildFishDensityWeightExpression,
  FISH_DENSITY_LAYER_ID,
  FISH_DENSITY_SOURCE_ID,
} from '../fishDensity';

describe('buildFishDensityStyle', () => {
  it('returns a heatmap layer weighted by fish_rate', () => {
    const style = buildFishDensityStyle({ min: 0, max: 0.5, levels: [0, 0.1, 0.2, 0.3, 0.5] });
    expect(FISH_DENSITY_SOURCE_ID).toBe('fish-density');
    expect(FISH_DENSITY_LAYER_ID).toBe('fish-density-heat');
    expect(style.layer.type).toBe('heatmap');

    const paint = (style.layer as { paint: Record<string, unknown> }).paint;
    expect(JSON.stringify(paint['heatmap-weight'])).toContain('fish_rate');
    expect(JSON.stringify(paint['heatmap-color'])).toContain('heatmap-density');
    expect(paint['heatmap-opacity'] as number).toBeCloseTo(0.75);
  });
});

describe('buildFishDensityWeightExpression', () => {
  it('maps the scan max rate to full weight and zero rate to none', () => {
    const expr = buildFishDensityWeightExpression({ min: 0, max: 0.4, levels: [] }) as unknown[];
    // interpolate linear over fish_rate: 0 → 0, 0.4 → 1.
    expect(expr[0]).toBe('interpolate');
    expect(JSON.stringify(expr)).toContain('fish_rate');
    // The stops include the max (0.4) mapping to weight 1.
    expect(expr).toContain(0.4);
    expect(expr).toContain(1);
  });

  it('falls back to a max of 1 when the scale has no positive range', () => {
    const expr = buildFishDensityWeightExpression({ min: 0, max: 0, levels: [] }) as unknown[];
    expect(expr).toContain(1);
  });
});
