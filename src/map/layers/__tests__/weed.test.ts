import { describe, expect, it } from 'vitest';
import { buildWeedStyle, WEED_LAYER_ID, WEED_SOURCE_ID } from '../weed';

describe('buildWeedStyle', () => {
  it('uses Greens ramp keyed off the level property', () => {
    const style = buildWeedStyle({ min: 0, max: 0.3, levels: [0, 0.1, 0.2, 0.3] });
    expect(WEED_SOURCE_ID).toBe('weed');
    expect(WEED_LAYER_ID).toBe('weed-fill');
    expect(style.layer.type).toBe('fill');
    const paint = style.layer.paint as Record<string, unknown>;
    expect(paint['fill-opacity'] as number).toBeCloseTo(0.55);
    const fc = paint['fill-color'];
    expect(JSON.stringify(fc)).toContain('level');
  });
});
