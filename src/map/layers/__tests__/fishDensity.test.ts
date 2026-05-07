import { describe, expect, it } from 'vitest';
import {
  buildFishDensityStyle,
  FISH_DENSITY_LAYER_ID,
  FISH_DENSITY_SOURCE_ID,
  FISH_ICON_NAME,
} from '../fishDensity';

describe('buildFishDensityStyle', () => {
  it('returns a symbol layer with fish icons sized by n_pings and tinted by fish_rate', () => {
    const style = buildFishDensityStyle({ min: 0, max: 0.5, levels: [0, 0.1, 0.2, 0.3, 0.5] });
    expect(FISH_DENSITY_SOURCE_ID).toBe('fish-density');
    expect(FISH_DENSITY_LAYER_ID).toBe('fish-density-circles');
    expect(FISH_ICON_NAME).toBe('fish-icon');
    expect(style.layer.type).toBe('symbol');

    const layout = (style.layer as { layout: Record<string, unknown> }).layout;
    expect(layout['icon-image']).toBe(FISH_ICON_NAME);
    expect(JSON.stringify(layout['icon-size'])).toContain('n_pings');
    expect(layout['icon-allow-overlap']).toBe(true);
    expect(layout['icon-rotation-alignment']).toBe('viewport');

    const paint = (style.layer as { paint: Record<string, unknown> }).paint;
    expect(JSON.stringify(paint['icon-color'])).toContain('fish_rate');
    expect(paint['icon-opacity'] as number).toBeCloseTo(0.95);
  });
});
