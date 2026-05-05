import { describe, expect, it } from 'vitest';
import { makeBath } from '../../../../test/fixtures/makeBath';
import { detectLiftouts, mad, rollingMedian } from '../outliers';

describe('rollingMedian', () => {
  it('returns the centred median over a window', () => {
    const m = rollingMedian([1, 2, 3, 4, 5, 6, 7], 3);
    expect(m).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('handles odd-length window with edge fill', () => {
    const m = rollingMedian([10, 1, 2, 1, 10], 3);
    expect(m[0]).toBe(10);
    expect(m[1]).toBe(2);
    expect(m[2]).toBe(1);
    expect(m[3]).toBe(2);
    expect(m[4]).toBe(10);
  });

  it('uses min_periods of ceil(window/2) at edges', () => {
    const m = rollingMedian([5, 5, 5, 100], 5);
    expect(m[3]).toBe(5);
  });

  it('throws when window is even', () => {
    expect(() => rollingMedian([1, 2, 3], 2)).toThrow(/odd/);
  });
});

describe('mad', () => {
  it('is 0 for constant input', () => {
    expect(mad([5, 5, 5, 5])).toBe(0);
  });

  it('is the median of absolute deviations from the median', () => {
    expect(mad([1, 2, 3, 4, 5])).toBe(1);
  });
});

describe('detectLiftouts', () => {
  it('flags depth values above the hard threshold', () => {
    const rows = makeBath({
      n: 10,
      mutator: (r, i) => {
        if (i === 5) r.depth_m = 12;
      },
    });
    const flags = detectLiftouts(rows, {
      hardThresholdM: 5,
      rollingWindow: 31,
      madMultiplier: 6,
      madOffsetM: 0.3,
      sessionGapS: 300,
    });
    expect(flags[5]).toBe(true);
    expect(flags.filter(Boolean)).toHaveLength(1);
  });

  it('flags rolling-median outliers below the hard threshold', () => {
    const rows = makeBath({
      n: 50,
      depth: 1.5,
      mutator: (r, i) => {
        if (i === 25) r.depth_m = 4;
      },
    });
    const flags = detectLiftouts(rows, {
      hardThresholdM: 5,
      rollingWindow: 31,
      madMultiplier: 6,
      madOffsetM: 0.3,
      sessionGapS: 300,
    });
    expect(flags[25]).toBe(true);
  });

  it('does not flag normal noise around the median', () => {
    const rows = makeBath({
      n: 100,
      mutator: (r, i) => {
        r.depth_m = 1.5 + (i % 5) * 0.05; // 1.5..1.7 oscillation
      },
    });
    const flags = detectLiftouts(rows, {
      hardThresholdM: 5,
      rollingWindow: 31,
      madMultiplier: 6,
      madOffsetM: 0.3,
      sessionGapS: 300,
    });
    expect(flags.filter(Boolean)).toHaveLength(0);
  });
});
