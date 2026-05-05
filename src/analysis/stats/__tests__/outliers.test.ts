import { describe, expect, it } from 'vitest';
import { makeBath } from '../../../../test/fixtures/makeBath';
import { detectLiftouts, mad, rollingMedian } from '../outliers';

describe('rollingMedian', () => {
  it('returns the centred median over a window', () => {
    // window=3, minPeriods=3: full window required, so edges (length-2 slices)
    // return the input value unchanged.
    const m = rollingMedian([1, 2, 3, 4, 5, 6, 7], 3, 3);
    expect(m).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('handles odd-length window with edge fill', () => {
    const m = rollingMedian([10, 1, 2, 1, 10], 3, 2);
    expect(m[0]).toBe(5.5);
    expect(m[1]).toBe(2);
    expect(m[2]).toBe(1);
    expect(m[3]).toBe(2);
    expect(m[4]).toBe(5.5);
  });

  it('respects minPeriods at edges (returns input value when window has too few values)', () => {
    // window=5, minPeriods=4: at index 0 we have a 3-element slice (length 3 < 4),
    // so we return the input value 100 unchanged. At index 4 the slice is 3 again.
    // At indices 1, 2, 3 the slices are 4, 5, 4 respectively (all >=4) so the
    // median is computed.
    const m = rollingMedian([100, 1, 2, 1, 100], 5, 4);
    expect(m[0]).toBe(100);
    expect(m[4]).toBe(100);
    expect(m[1]).toBe(1.5); // median of [100,1,2,1] = (1+2)/2
    expect(m[2]).toBe(2); // median of [100,1,2,1,100]
    expect(m[3]).toBe(1.5); // median of [1,2,1,100]
  });

  it('throws when window is even', () => {
    expect(() => rollingMedian([1, 2, 3], 2, 1)).toThrow(/odd/);
  });
});

describe('mad', () => {
  it('is 0 for constant input', () => {
    expect(mad([5, 5, 5, 5])).toBe(0);
  });

  it('is the median of absolute deviations from the median', () => {
    expect(mad([1, 2, 3, 4, 5])).toBe(1);
  });

  it('returns 0 for empty input', () => {
    expect(mad([])).toBe(0);
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

  it('splits sessions on ts_ms gaps > sessionGapS', () => {
    // Two large sessions separated by a 600 s gap; spike in the second is
    // detected by its session-local rolling median (which is independent of
    // the first session's depths).
    const rows = makeBath({
      n: 60,
      mutator: (r, i) => {
        if (i >= 30) r.ts_ms += 600_000; // 600 s gap before row 30
        if (i === 45) r.depth_m = 4;
      },
    });
    const flags = detectLiftouts(rows, {
      hardThresholdM: 5,
      rollingWindow: 31,
      madMultiplier: 6,
      madOffsetM: 0.3,
      sessionGapS: 300,
    });
    // Spike sits inside the second session, not the first.
    expect(flags[45]).toBe(true);
  });

  it('flags rolling outliers in sessions of length 5..15 (matches Python)', () => {
    // 12-row session, depth ~1.5 throughout, with a single outlier at index 6.
    // Python's rolling(31, center=True, min_periods=5) computes a median for
    // every index (because length=12 >= 5), so the outlier at i=6 is flagged.
    const rows = makeBath({
      n: 12,
      mutator: (r, i) => {
        if (i === 6) r.depth_m = 4.0;
      },
    });
    const flags = detectLiftouts(rows, {
      hardThresholdM: 5,
      rollingWindow: 31,
      madMultiplier: 6,
      madOffsetM: 0.3,
      sessionGapS: 300,
    });
    expect(flags[6]).toBe(true);
    // Other rows in the session should not be flagged.
    expect(flags.filter(Boolean)).toHaveLength(1);
  });

  it('skips rolling-median pass for sessions shorter than 5 rows', () => {
    // 4 rows is below the per-session minimum length; only the hard threshold
    // applies, so nothing here gets flagged.
    const rows = makeBath({ n: 4 });
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
