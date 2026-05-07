import { describe, expect, it } from 'vitest';
import {
  greensRamp,
  lerpHex,
  quantileColorStops,
  sampleRamp,
  viridisRamp,
  ylOrRdRamp,
} from '../colors';

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

describe('quantileColorStops', () => {
  it('returns level/colour pairs alternating', () => {
    const stops = quantileColorStops([0, 0.5, 1], viridisRamp);
    expect(stops).toHaveLength(6);
    expect(typeof stops[0]).toBe('number');
    expect(typeof stops[1]).toBe('string');
    expect(typeof stops[2]).toBe('number');
    expect(typeof stops[3]).toBe('string');
    expect(typeof stops[4]).toBe('number');
    expect(typeof stops[5]).toBe('string');
  });

  it('first and last stops use the ramp endpoints', () => {
    const stops = quantileColorStops([1, 2, 3, 4], greensRamp);
    expect(stops[0]).toBe(1);
    expect((stops[1] as string).toLowerCase()).toBe(greensRamp[0]![1].toLowerCase());
    expect(stops[stops.length - 2]).toBe(4);
    expect((stops[stops.length - 1] as string).toLowerCase()).toBe(
      greensRamp[greensRamp.length - 1]![1].toLowerCase(),
    );
  });

  it('falls back to a 0/1 ramp when given empty levels', () => {
    const stops = quantileColorStops([], ylOrRdRamp);
    expect(stops).toEqual([0, ylOrRdRamp[0]![1], 1, ylOrRdRamp[ylOrRdRamp.length - 1]![1]]);
  });

  it('handles a single-level input by anchoring to the ramp start', () => {
    const stops = quantileColorStops([5], viridisRamp);
    expect(stops).toHaveLength(2);
    expect(stops[0]).toBe(5);
    expect((stops[1] as string).toLowerCase()).toBe(viridisRamp[0]![1].toLowerCase());
  });
});

describe('sampleRamp', () => {
  it('returns the ramp endpoint colours at t=0 and t=1', () => {
    expect(sampleRamp(viridisRamp, 0).toLowerCase()).toBe(viridisRamp[0]![1].toLowerCase());
    expect(sampleRamp(viridisRamp, 1).toLowerCase()).toBe(
      viridisRamp[viridisRamp.length - 1]![1].toLowerCase(),
    );
  });

  it('interpolates between bracketing ramp colours', () => {
    // A simple 2-stop ramp lets us assert the midpoint exactly.
    const ramp: readonly [number, string][] = [
      [0, '#000000'],
      [1, '#ffffff'],
    ];
    const mid = sampleRamp(ramp, 0.5);
    // Midpoint of #000000 and #ffffff: each channel = round(127.5) = 128.
    expect(mid).toBe('#808080');
  });

  it('clamps values past the last stop to the final colour', () => {
    const ramp: readonly [number, string][] = [
      [0, '#000000'],
      [0.5, '#888888'],
    ];
    expect(sampleRamp(ramp, 0.9)).toBe('#888888');
  });
});

describe('lerpHex', () => {
  it('produces correct rgb mid-point', () => {
    expect(lerpHex('#000000', '#ffffff', 0.5)).toBe('#808080');
  });

  it('returns the start colour at t=0', () => {
    expect(lerpHex('#abcdef', '#123456', 0)).toBe('#abcdef');
  });

  it('returns the end colour at t=1', () => {
    expect(lerpHex('#abcdef', '#123456', 1)).toBe('#123456');
  });

  it('interpolates per-channel', () => {
    // R: 0 → 200, t=0.25 → 50; G: 100 → 200, t=0.25 → 125; B: 50 → 50, t=0.25 → 50.
    expect(lerpHex('#006432', '#c8c832', 0.25)).toBe('#327d32');
  });
});
