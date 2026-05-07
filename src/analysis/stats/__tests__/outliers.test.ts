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
      globalMadMultiplier: 4,
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
      globalMadMultiplier: 4,
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
      globalMadMultiplier: 4,
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
      globalMadMultiplier: 4,
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
      globalMadMultiplier: 4,
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
      globalMadMultiplier: 4,
    });
    expect(flags.filter(Boolean)).toHaveLength(0);
  });

  it('flags sustained lift-out cluster the rolling-median pass misses', () => {
    // 100 rows: 70 at 1.2 m (real depth), then 30 consecutive rows at 4.5 m
    // (sustained lift-out — boat parked on the bank). The 30 sustained rows
    // pollute their own rolling-31 window, so the per-session pass alone
    // can't distinguish them from "real" data. The global-MAD third pass,
    // operating on the survivor distribution, must catch them.
    const rows = makeBath({
      n: 100,
      mutator: (r, i) => {
        r.depth_m = i < 70 ? 1.2 : 4.5;
      },
    });
    const flags = detectLiftouts(rows, {
      hardThresholdM: 5,
      rollingWindow: 31,
      madMultiplier: 6,
      madOffsetM: 0.3,
      sessionGapS: 300,
      globalMadMultiplier: 4,
    });
    for (let i = 70; i < 100; i++) {
      expect(flags[i], `row ${i} (sustained lift-out at 4.5m) should be flagged`).toBe(true);
    }
  });

  it('converges via iteration for multi-modal lift-outs', () => {
    // 60 real (1.5 m), 20 mild lift-out (3.0 m), 20 sustained heavier
    // lift-out (4.5 m). One global iteration alone might not flag the 3.0 m
    // bracket because the 4.5 m tier inflates the initial MAD estimate; the
    // iteration loop must shrink the survivor set, recompute, and catch it.
    const rows = makeBath({
      n: 100,
      mutator: (r, i) => {
        if (i < 60) r.depth_m = 1.5;
        else if (i < 80) r.depth_m = 3.0;
        else r.depth_m = 4.5;
      },
    });
    const flags = detectLiftouts(rows, {
      hardThresholdM: 5,
      rollingWindow: 31,
      madMultiplier: 6,
      madOffsetM: 0.3,
      sessionGapS: 300,
      globalMadMultiplier: 4,
    });
    for (let i = 60; i < 100; i++) {
      expect(flags[i], `row ${i} (lift-out cluster) should be flagged after iteration`).toBe(true);
    }
  });

  it('globalMadMultiplier=Infinity disables the global pass', () => {
    // Same input as the sustained-cluster test: with globalMadMultiplier
    // effectively disabled, only the existing two passes' flags remain. The
    // sustained cluster pollutes its own rolling window, so the per-session
    // pass alone leaves most or all of those rows unflagged. Documents how a
    // user opts out of the new behaviour.
    const rows = makeBath({
      n: 100,
      mutator: (r, i) => {
        r.depth_m = i < 70 ? 1.2 : 4.5;
      },
    });
    const flags = detectLiftouts(rows, {
      hardThresholdM: 5,
      rollingWindow: 31,
      madMultiplier: 6,
      madOffsetM: 0.3,
      sessionGapS: 300,
      globalMadMultiplier: Infinity,
    });
    // Sustained cluster largely survives — at least the centre of the cluster
    // (where the rolling window sees only lift-out values) is unflagged.
    expect(flags[85]).toBe(false);
    expect(flags[90]).toBe(false);
  });

  it('globalMadMultiplier does not flag real shallow values below median', () => {
    // Two-tier real depth distribution: a deep tier (~3.0 m) and a shallow
    // tier (~1.5 m). The shallow tier's depths sit BELOW the global median
    // and could in principle be flagged by a symmetric (|d - median|)
    // global-MAD gate. The above-median gate must leave them alone.
    //
    // Setup avoids tripping the per-session rolling-median pass by giving
    // both tiers similar amounts of data (35 each) and a transition zone
    // that gradually steps between them — pass 2's local rolling window
    // therefore never sees the shallow tier as "an outlier vs the local
    // median".
    //
    // Lift-outs always read DEEPER than reality (boat in air or pinging the
    // bank); a too-shallow reading is a real shallow spot, not a lift-out.
    const rows = makeBath({
      n: 100,
      mutator: (r, i) => {
        // 0-34: shallow tier ~1.5 m. 35-64: gradual transition. 65-99: deep
        // tier ~3.0 m. The transition keeps the rolling median continuous.
        if (i < 35) r.depth_m = 1.5 + (i % 5) * 0.02;
        else if (i < 65) r.depth_m = 1.5 + ((i - 35) / 30) * 1.5;
        else r.depth_m = 3.0 + (i % 5) * 0.02;
      },
    });
    const flags = detectLiftouts(rows, {
      hardThresholdM: 5,
      rollingWindow: 31,
      madMultiplier: 6,
      madOffsetM: 0.3,
      sessionGapS: 300,
      globalMadMultiplier: 1, // very aggressive — would catch shallow rows if symmetric
    });
    // The shallow tier (rows 0..34) sits well below the global median (~2.5
    // m); a symmetric global-MAD pass would flag them. The above-median
    // gate must NOT.
    for (let i = 0; i < 35; i++) {
      expect(flags[i], `row ${i} (real shallow ping below median) must NOT be flagged`).toBe(false);
    }
  });
});
