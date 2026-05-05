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
