import { describe, expect, it } from 'vitest';
import {
  buildFishDensityStyle,
  FISH_DENSITY_LAYER_ID,
  FISH_DENSITY_SOURCE_ID,
} from '../fishDensity';

describe('buildFishDensityStyle', () => {
  it('returns a circle layer with radius keyed off n_pings and color off fish_rate', () => {
    const style = buildFishDensityStyle({ min: 0, max: 0.5 });
    expect(FISH_DENSITY_SOURCE_ID).toBe('fish-density');
    expect(FISH_DENSITY_LAYER_ID).toBe('fish-density-circles');
    expect(style.layer.type).toBe('circle');
    const paint = style.layer.paint as Record<string, unknown>;
    expect(JSON.stringify(paint['circle-radius'])).toContain('n_pings');
    expect(JSON.stringify(paint['circle-color'])).toContain('fish_rate');
    expect(paint['circle-opacity'] as number).toBeCloseTo(0.85);
  });
});
