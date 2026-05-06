import type {
  CategorisedCellRow,
  CategorisedCells,
  CategoryThresholds,
  Cells,
  ScanCategory,
} from '../types';

function classify(fish_rate: number, mean_weed: number, t: CategoryThresholds): ScanCategory {
  if (fish_rate >= t.goldFishRate && mean_weed > t.weededMinWeed) return 'weeded';
  if (fish_rate >= t.goldFishRate && mean_weed <= t.goldMaxWeed) return 'gold';
  if (fish_rate >= t.goldFishRate && mean_weed <= t.silverMaxWeed) return 'silver';
  if (fish_rate >= t.bronzeFishRate && fish_rate < t.goldFishRate && mean_weed <= t.bronzeMaxWeed) {
    return 'bronze';
  }
  return 'none';
}

export function categoriseCells(cells: Cells, thresholds: CategoryThresholds): CategorisedCells {
  const rows: CategorisedCellRow[] = cells.rows.map((c) => ({
    ...c,
    category: classify(c.fish_rate, c.mean_weed, thresholds),
  }));
  return { cellSizeM: cells.cellSizeM, origin: cells.origin, rows };
}
