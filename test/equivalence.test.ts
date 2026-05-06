import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { aggregateCells } from '../src/analysis/pipeline/aggregateCells';
import { analysePings } from '../src/analysis/pipeline/analysePings';
import { categoriseCells } from '../src/analysis/pipeline/categoriseCells';
import { cleanBathymetry } from '../src/analysis/pipeline/cleanBathymetry';
import {
  parseQuestBathymetry,
  parseQuestSonar,
  type ParseDiagnostics,
} from '../src/analysis/parsers/quest';
import {
  DEFAULT_CATEGORY_THRESHOLDS,
  DEFAULT_CELL_OPTIONS,
  DEFAULT_LIFTOUT_OPTIONS,
  DEFAULT_SONAR_OPTIONS,
} from '../src/analysis/constants';

interface SnapshotCell {
  cx: number;
  cy: number;
  n_pings: number;
  mean_depth: number;
  mean_weed: number;
  fish_rate: number;
  category: string;
}

interface Snapshot {
  n_pings_total: number;
  fish_pings: number;
  cells: SnapshotCell[];
}

function load(name: string): string {
  return readFileSync(resolve(__dirname, 'fixtures', name), 'utf8');
}

describe('Python equivalence', () => {
  it('produces matching cell categories and per-cell metrics', () => {
    const diag: ParseDiagnostics = { malformedRowCount: 0, totalRows: 0, errors: [] };
    const bath = parseQuestBathymetry(load('reference-bath.csv'), diag);
    const sonar = parseQuestSonar(load('reference-sonar.csv'), diag);

    const cleaned = cleanBathymetry(bath, DEFAULT_LIFTOUT_OPTIONS, 0);
    const perPing = analysePings(sonar, cleaned.rows, DEFAULT_SONAR_OPTIONS);
    const cells = aggregateCells(perPing, DEFAULT_CELL_OPTIONS);
    const categorised = categoriseCells(cells, DEFAULT_CATEGORY_THRESHOLDS);

    const snapshot = JSON.parse(load('reference-snapshot.json')) as Snapshot;

    // Total fish ping count: tolerance 1% (the cell-aggregation flooring can
    // drift by 1-2 across pipelines)
    const tsFish = perPing.rows.filter((r) => r.fish_count >= 1).length;
    expect(Math.abs(tsFish - snapshot.fish_pings)).toBeLessThanOrEqual(
      Math.max(2, Math.floor(snapshot.fish_pings * 0.01)),
    );

    // Per-cell match: same set of (cx, cy) keys and same category for each.
    const tsByKey = new Map(categorised.rows.map((c) => [`${c.cx},${c.cy}`, c]));
    for (const ref of snapshot.cells) {
      const ts = tsByKey.get(`${ref.cx},${ref.cy}`);
      expect(ts, `cell ${ref.cx},${ref.cy} missing from TS output`).toBeDefined();
      expect(ts!.category).toBe(ref.category);
      expect(ts!.n_pings).toBe(ref.n_pings);
      expect(ts!.mean_depth).toBeCloseTo(ref.mean_depth, 3);
      expect(ts!.fish_rate).toBeCloseTo(ref.fish_rate, 5);
    }
  });
});
