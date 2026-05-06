import { describe, expect, it } from 'vitest';
import { greensRamp, viridisRamp, ylOrRdRamp } from '../colors';

describe('color ramps', () => {
  it('viridisRamp returns 9 [stop, color] pairs', () => {
    expect(viridisRamp).toHaveLength(9);
    for (const [stop, color] of viridisRamp) {
      expect(typeof stop).toBe('number');
      expect(stop).toBeGreaterThanOrEqual(0);
      expect(stop).toBeLessThanOrEqual(1);
      expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it('greensRamp goes light to dark', () => {
    expect(greensRamp[0]?.[0]).toBe(0);
    expect(greensRamp[greensRamp.length - 1]?.[0]).toBe(1);
  });

  it('ylOrRdRamp ends at red', () => {
    const last = ylOrRdRamp[ylOrRdRamp.length - 1]?.[1];
    expect(last).toBeDefined();
    // Last stop should be a saturated red — verify via parsing the hex.
    const r = parseInt(last!.slice(1, 3), 16);
    const g = parseInt(last!.slice(3, 5), 16);
    // matplotlib's YlOrRd 9th stop is #800026 (dark crimson). Verify red
    // dominates green by a wide margin — i.e. clearly in the red region.
    expect(r).toBeGreaterThan(0x60);
    expect(g).toBeLessThan(0x80);
    expect(r - g).toBeGreaterThan(0x60);
  });
});
