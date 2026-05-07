import { describe, expect, it } from 'vitest';
import { computeContourLevels, trimmedRange } from '../colorScale';

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

  it('returns the literal min/max when trimming leaves a single value', () => {
    // 3 values, trim 33% → ceil(3*33/100)=1 trim from each end → window length 1.
    // The < 2 fallback uses the literal sorted min/max.
    const r = trimmedRange([1, 5, 10], 33);
    expect(r.min).toBe(1);
    expect(r.max).toBe(10);
  });
});

describe('computeContourLevels', () => {
  it('produces 12 levels for a uniform [0,1] distribution evenly-spaced', () => {
    // For uniform input quantiles ARE linear, so the result should be
    // approximately [0, 1/11, 2/11, …, 1].
    const values = Array.from({ length: 1000 }, (_, i) => i / 999);
    const levels = computeContourLevels(values, 12);
    expect(levels).toHaveLength(12);
    for (let i = 0; i < 12; i++) {
      const expected = i / 11;
      expect(levels[i]).toBeCloseTo(expected, 2);
    }
  });

  it('concentrates levels in the dense region for skewed data', () => {
    // 90% of values in [0, 0.1], 10% in [0.1, 1.0].
    const dense = Array.from({ length: 900 }, (_, i) => (i / 899) * 0.1);
    const sparse = Array.from({ length: 100 }, (_, i) => 0.1 + (i / 99) * 0.9);
    const values = [...dense, ...sparse];
    const levels = computeContourLevels(values, 10);
    // Most levels should fall in [0, 0.1] (the dense region).
    const inDense = levels.filter((l) => l <= 0.1).length;
    expect(inDense).toBeGreaterThan(levels.length / 2);
  });

  it('guarantees strictly increasing output for tied values', () => {
    // Half zeros, half ones — naive quantile would produce [0, 0, 1, 1].
    const values = [0, 0, 0, 0, 1, 1, 1, 1];
    const levels = computeContourLevels(values, 4);
    expect(levels).toHaveLength(4);
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i]!).toBeGreaterThan(levels[i - 1]!);
    }
  });

  it('handles empty input with a fallback evenly-spaced [0,1]', () => {
    const levels = computeContourLevels([], 5);
    expect(levels).toHaveLength(5);
    expect(levels[0]).toBe(0);
    expect(levels[levels.length - 1]).toBe(1);
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i]!).toBeGreaterThan(levels[i - 1]!);
    }
  });

  it('returns a single value for n=1', () => {
    expect(computeContourLevels([3, 7, 11], 1)).toEqual([3]);
    expect(computeContourLevels([], 1)).toEqual([0]);
  });
});
