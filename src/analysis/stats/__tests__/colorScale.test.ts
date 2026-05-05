import { describe, expect, it } from 'vitest';
import { trimmedRange } from '../colorScale';

describe('trimmedRange', () => {
  it('returns the literal min/max when trimPct is 0', () => {
    const r = trimmedRange([1, 2, 3, 4, 5], 0);
    expect(r).toEqual({ min: 1, max: 5 });
  });

  it('drops the bottom and top trim percentage', () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100
    const r = trimmedRange(values, 5);
    // Drops the bottom 5 and top 5, leaving 6..95.
    expect(r).toEqual({ min: 6, max: 95 });
  });

  it('handles a single value (degenerate)', () => {
    const r = trimmedRange([7], 1);
    expect(r.min).toBeCloseTo(7);
    expect(r.max).toBeCloseTo(7 + 1e-6);
  });

  it('avoids divide-by-zero when min==max', () => {
    const r = trimmedRange([3, 3, 3, 3, 3], 0);
    expect(r.min).toBe(3);
    expect(r.max - r.min).toBeCloseTo(1e-6);
  });

  it('throws on empty input', () => {
    expect(() => trimmedRange([], 0)).toThrow(/empty/);
  });

  it('clamps trimPct to [0, 49]', () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const high = trimmedRange(values, 100);
    expect(high.min).toBeCloseTo(high.max, 5); // everything trimmed → degenerate
  });
});
