import type { BathRow } from '../parsers/types';
import { detectLiftouts } from '../stats/outliers';
import type { CleanBath, CleanBathRow, LiftoutOptions, SessionMeta } from '../types';

// A row has a real GPS fix if EITHER coordinate is nonzero. The Quest emits
// (0, 0) when there's no fix; a row with only one zero is either a real
// near-equator/prime-meridian fix or pathological — in both cases we treat it
// as a fix and do NOT interpolate over it.
function hasGps(r: BathRow): boolean {
  return r.lat !== 0 || r.lon !== 0;
}

function dedupePreferGps(rows: readonly BathRow[]): BathRow[] {
  const sorted = [...rows].sort((a, b) => {
    if (a.ts_ms !== b.ts_ms) return a.ts_ms - b.ts_ms;
    const aGps = hasGps(a) ? 1 : 0;
    const bGps = hasGps(b) ? 1 : 0;
    return bGps - aGps;
  });
  const out: BathRow[] = [];
  let lastTs = Number.NaN;
  for (const r of sorted) {
    if (r.ts_ms === lastTs) continue;
    out.push(r);
    lastTs = r.ts_ms;
  }
  return out;
}

function interpolateGps(rows: BathRow[]): BathRow[] {
  // Linear interpolation by ts_ms for rows where lat==0 OR lon==0.
  // Drop rows that fall outside any pair of GPS-tagged anchors.
  const out: BathRow[] = [];
  let prev: BathRow | undefined;
  let next: BathRow | undefined;
  let nextIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    if (hasGps(r)) {
      out.push(r);
      prev = r;
      next = undefined;
      nextIdx = -1;
      continue;
    }
    if (!next || nextIdx <= i) {
      next = undefined;
      nextIdx = -1;
      for (let j = i + 1; j < rows.length; j++) {
        const candidate = rows[j]!;
        if (hasGps(candidate)) {
          next = candidate;
          nextIdx = j;
          break;
        }
      }
    }
    if (!prev || !next) continue;
    // Span is guaranteed > 0 because dedupePreferGps removed equal timestamps.
    const span = next.ts_ms - prev.ts_ms;
    const f = (r.ts_ms - prev.ts_ms) / span;
    out.push({
      ...r,
      lat: prev.lat + (next.lat - prev.lat) * f,
      lon: prev.lon + (next.lon - prev.lon) * f,
    });
  }
  return out;
}

function partitionSessions(rows: readonly BathRow[], sessionGapS: number): number[] {
  // Returns a parallel array of session ids (0, 1, 2, ...).
  const ids: number[] = new Array<number>(rows.length).fill(0);
  let cur = 0;
  for (let i = 1; i < rows.length; i++) {
    const gapS = (rows[i]!.ts_ms - rows[i - 1]!.ts_ms) / 1000;
    if (gapS > sessionGapS) cur++;
    ids[i] = cur;
  }
  return ids;
}

export function cleanBathymetry(
  rawRows: readonly BathRow[],
  opts: LiftoutOptions,
  fileId: number,
): CleanBath {
  const deduped = dedupePreferGps(rawRows);
  const sessionIds = partitionSessions(deduped, opts.sessionGapS);

  const flags = detectLiftouts(deduped, opts);
  const survivors: BathRow[] = [];
  const survivorSessions: number[] = [];
  let liftoutsRemoved = 0;
  for (let i = 0; i < deduped.length; i++) {
    if (flags[i]) {
      liftoutsRemoved++;
      continue;
    }
    survivors.push(deduped[i]!);
    survivorSessions.push(sessionIds[i]!);
  }

  const interpolated = interpolateGps(survivors);
  // Map interpolated rows back to their session ids by ts_ms.
  const sessionByTs = new Map<number, number>();
  for (let i = 0; i < survivors.length; i++) {
    sessionByTs.set(survivors[i]!.ts_ms, survivorSessions[i]!);
  }

  const cleanRows: CleanBathRow[] = interpolated.map((r) => {
    // sessionByTs always has every ts_ms because interpolated is derived from survivors.
    const row: CleanBathRow = {
      ts_ms: r.ts_ms,
      lat: r.lat,
      lon: r.lon,
      depth_m: r.depth_m,
      session_id: sessionByTs.get(r.ts_ms)!,
      file_id: fileId,
    };
    if (r.temp_c !== undefined) row.temp_c = r.temp_c;
    return row;
  });

  // Compute session metadata.
  const sessionMap = new Map<number, CleanBathRow[]>();
  for (const r of cleanRows) {
    const list = sessionMap.get(r.session_id) ?? [];
    list.push(r);
    sessionMap.set(r.session_id, list);
  }
  // For was_lifted_out_pct we need the pre-removal session size; recompute from
  // sessionIds + flags.
  const preCounts = new Map<number, { total: number; lifted: number }>();
  for (let i = 0; i < deduped.length; i++) {
    const id = sessionIds[i]!;
    const e = preCounts.get(id) ?? { total: 0, lifted: 0 };
    e.total++;
    if (flags[i]) e.lifted++;
    preCounts.set(id, e);
  }

  const sessions: SessionMeta[] = [];
  for (const [id, list] of sessionMap) {
    // Compute the session's time span in a single pass. Do NOT use
    // `Math.min(...tsList)` / `Math.max(...tsList)`: a long session can hold
    // hundreds of thousands of pings, and spreading that many arguments into a
    // function call overflows the call stack ("Maximum call stack size
    // exceeded") — which is exactly how large scans failed to process.
    let tStart = Infinity;
    let tEnd = -Infinity;
    for (const r of list) {
      if (r.ts_ms < tStart) tStart = r.ts_ms;
      if (r.ts_ms > tEnd) tEnd = r.ts_ms;
    }
    // preCounts always has the id because session ids in cleanRows are derived
    // from survivors which were drawn from deduped where preCounts was built.
    const pre = preCounts.get(id)!;
    sessions.push({
      id,
      t_start: tStart,
      t_end: tEnd,
      n_pings: list.length,
      was_lifted_out_pct: (100 * pre.lifted) / pre.total,
    });
  }
  sessions.sort((a, b) => a.id - b.id);

  return { rows: cleanRows, sessions, liftoutsRemoved };
}
