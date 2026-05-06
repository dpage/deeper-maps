import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  DEFAULT_CATEGORY_THRESHOLDS,
  DEFAULT_CELL_OPTIONS,
  DEFAULT_COLOR_SCALE_OPTIONS,
  DEFAULT_LIFTOUT_OPTIONS,
  DEFAULT_SONAR_OPTIONS,
} from '../src/analysis/constants';
import { aggregateCells } from '../src/analysis/pipeline/aggregateCells';
import { analysePings } from '../src/analysis/pipeline/analysePings';
import { buildLayers } from '../src/analysis/pipeline/buildLayers';
import { categoriseCells } from '../src/analysis/pipeline/categoriseCells';
import { cleanBathymetry } from '../src/analysis/pipeline/cleanBathymetry';
import { parseQuestUpload, type UploadFile } from '../src/analysis/parsers/zip';

function loadInputs(target: string): UploadFile[] {
  const abs = resolve(target);
  const stat = statSync(abs);
  if (stat.isDirectory()) {
    return readdirSync(abs).map((name) => ({
      fileName: name,
      bytes: new Uint8Array(readFileSync(join(abs, name))),
    }));
  }
  return [
    {
      fileName: abs.split('/').pop() ?? 'upload.zip',
      bytes: new Uint8Array(readFileSync(abs)),
    },
  ];
}

async function main(): Promise<void> {
  const target = process.argv[2];
  if (!target) {
    console.error('Usage: tsx scripts/run-analysis.ts <path-to-scan.zip-or-folder>');
    process.exit(1);
  }
  const t0 = performance.now();
  const inputs = loadInputs(target);
  const { scan, warnings } = await parseQuestUpload(inputs);
  if (warnings.length) console.error('warnings:', warnings);
  console.log(
    `parsed: bath=${scan.bathymetry.length}, sonar=${scan.sonar.length}, files=${scan.source.length}`,
  );

  const cleaned = cleanBathymetry(scan.bathymetry, DEFAULT_LIFTOUT_OPTIONS, 0);
  console.log(
    `cleaned: rows=${cleaned.rows.length}, sessions=${cleaned.sessions.length}, lifted=${cleaned.liftoutsRemoved}`,
  );

  const perPing = analysePings(scan.sonar, cleaned.rows, DEFAULT_SONAR_OPTIONS);
  const fishPings = perPing.rows.filter((r) => r.fish_count >= 1).length;
  console.log(
    `pings analysed: ${perPing.rows.length} (fish in ${fishPings}, ${(
      (fishPings / Math.max(1, perPing.rows.length)) *
      100
    ).toFixed(1)}%)`,
  );

  const cells = aggregateCells(perPing, DEFAULT_CELL_OPTIONS);
  const categorised = categoriseCells(cells, DEFAULT_CATEGORY_THRESHOLDS);
  const counts: Record<string, number> = {};
  for (const c of categorised.rows) counts[c.category] = (counts[c.category] ?? 0) + 1;
  console.log(`cells: ${cells.rows.length}, categories: ${JSON.stringify(counts)}`);

  const bundle = buildLayers(cleaned, categorised, DEFAULT_COLOR_SCALE_OPTIONS);
  console.log(
    `scales: depth=[${bundle.scales.depth.min.toFixed(2)}, ${bundle.scales.depth.max.toFixed(2)}], ` +
      `weed=[${bundle.scales.weed.min.toFixed(3)}, ${bundle.scales.weed.max.toFixed(3)}], ` +
      `fishRate=[${bundle.scales.fishRate.min.toFixed(3)}, ${bundle.scales.fishRate.max.toFixed(3)}]`,
  );
  console.log(`elapsed: ${(performance.now() - t0).toFixed(0)} ms`);
}

void main();
