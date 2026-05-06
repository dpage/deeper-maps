import { describe, expect, it } from 'vitest';
import { DEFAULT_CATEGORY_THRESHOLDS } from '../../constants';
import type { CellRow, Cells } from '../../types';
import { categoriseCells } from '../categoriseCells';

const cell = (overrides: Partial<CellRow>): CellRow => ({
  cx: 0,
  cy: 0,
  lat: 51,
  lon: -1,
  n_pings: 10,
  mean_depth: 1.5,
  mean_weed: 0,
  fish_rate: 0,
  bottom_hardness: 1000,
  ...overrides,
});

const wrap = (rows: CellRow[]): Cells => ({
  cellSizeM: 2,
  origin: { lat: 51, lon: -1 },
  rows,
});

describe('categoriseCells', () => {
  it('categorises gold (high fish, clean bottom)', () => {
    const out = categoriseCells(
      wrap([cell({ fish_rate: 0.2, mean_weed: 0 })]),
      DEFAULT_CATEGORY_THRESHOLDS,
    );
    expect(out.rows[0]?.category).toBe('gold');
  });

  it('categorises silver (high fish, light weed)', () => {
    const out = categoriseCells(
      wrap([cell({ fish_rate: 0.2, mean_weed: 0.1 })]),
      DEFAULT_CATEGORY_THRESHOLDS,
    );
    expect(out.rows[0]?.category).toBe('silver');
  });

  it('categorises bronze (medium fish, light weed)', () => {
    const out = categoriseCells(
      wrap([cell({ fish_rate: 0.07, mean_weed: 0.1 })]),
      DEFAULT_CATEGORY_THRESHOLDS,
    );
    expect(out.rows[0]?.category).toBe('bronze');
  });

  it('categorises weeded (high fish, heavy weed)', () => {
    const out = categoriseCells(
      wrap([cell({ fish_rate: 0.2, mean_weed: 0.3 })]),
      DEFAULT_CATEGORY_THRESHOLDS,
    );
    expect(out.rows[0]?.category).toBe('weeded');
  });

  it('categorises none (low fish, anything)', () => {
    const out = categoriseCells(
      wrap([cell({ fish_rate: 0.01, mean_weed: 0 })]),
      DEFAULT_CATEGORY_THRESHOLDS,
    );
    expect(out.rows[0]?.category).toBe('none');
  });
});
