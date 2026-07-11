import type { CellOptions, CellRow, Cells, PerPing } from '../types';

const MAX_CELLS = 100_000;
const METRES_PER_DEG_LAT = 111_000;

export function aggregateCells(perPing: PerPing, opts: CellOptions): Cells {
  const rows = perPing.rows;
  if (rows.length === 0) {
    return { cellSizeM: opts.cellSizeM, origin: { lat: 0, lon: 0 }, rows: [] };
  }

  let minLat = Infinity;
  let minLon = Infinity;
  let sumLat = 0;
  for (const r of rows) {
    if (r.lat < minLat) minLat = r.lat;
    if (r.lon < minLon) minLon = r.lon;
    sumLat += r.lat;
  }
  const meanLat = sumLat / rows.length;
  const lonMetresPerDeg = METRES_PER_DEG_LAT * Math.cos((meanLat * Math.PI) / 180);

  interface Acc {
    cx: number;
    cy: number;
    n_pings: number;
    sumDepth: number;
    sumWeed: number;
    n_fish_pings: number;
    sumHardness: number;
    sumTemp: number;
    nTemp: number;
    sumLat: number;
    sumLon: number;
    tStart: number;
    tEnd: number;
  }
  const cellsMap = new Map<string, Acc>();

  for (const r of rows) {
    const yM = (r.lat - minLat) * METRES_PER_DEG_LAT;
    const xM = (r.lon - minLon) * lonMetresPerDeg;
    const cx = Math.round(xM / opts.cellSizeM) * opts.cellSizeM;
    const cy = Math.round(yM / opts.cellSizeM) * opts.cellSizeM;
    const key = `${cx},${cy}`;
    let acc = cellsMap.get(key);
    if (!acc) {
      acc = {
        cx,
        cy,
        n_pings: 0,
        sumDepth: 0,
        sumWeed: 0,
        n_fish_pings: 0,
        sumHardness: 0,
        sumTemp: 0,
        nTemp: 0,
        sumLat: 0,
        sumLon: 0,
        tStart: Infinity,
        tEnd: -Infinity,
      };
      cellsMap.set(key, acc);
      if (cellsMap.size > MAX_CELLS) {
        throw new Error(`aggregateCells: too many cells (>${MAX_CELLS}). Increase cellSizeM.`);
      }
    }
    acc.n_pings++;
    acc.sumDepth += r.depth_m;
    acc.sumWeed += r.weed_height_m;
    if (r.fish_count >= 1) acc.n_fish_pings++;
    acc.sumHardness += r.hard_bottom_peak;
    if (r.temp_c !== undefined) {
      acc.sumTemp += r.temp_c;
      acc.nTemp++;
    }
    acc.sumLat += r.lat;
    acc.sumLon += r.lon;
    if (r.ts_ms < acc.tStart) acc.tStart = r.ts_ms;
    if (r.ts_ms > acc.tEnd) acc.tEnd = r.ts_ms;
  }

  const out: CellRow[] = [];
  for (const acc of cellsMap.values()) {
    if (acc.n_pings < opts.minPingsPerCell) continue;
    const cell: CellRow = {
      cx: acc.cx,
      cy: acc.cy,
      lat: acc.sumLat / acc.n_pings,
      lon: acc.sumLon / acc.n_pings,
      n_pings: acc.n_pings,
      mean_depth: acc.sumDepth / acc.n_pings,
      mean_weed: acc.sumWeed / acc.n_pings,
      fish_rate: acc.n_fish_pings / acc.n_pings,
      bottom_hardness: acc.sumHardness / acc.n_pings,
      t_start_ms: acc.tStart,
      t_end_ms: acc.tEnd,
    };
    if (acc.nTemp > 0) cell.mean_temp_c = acc.sumTemp / acc.nTemp;
    out.push(cell);
  }

  return {
    cellSizeM: opts.cellSizeM,
    origin: { lat: minLat, lon: minLon },
    rows: out,
  };
}
