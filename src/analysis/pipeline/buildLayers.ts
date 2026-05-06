import type { FeatureCollection } from 'geojson';
import { trimmedRange } from '../stats/colorScale';
import type {
  CategorisedCells,
  CleanBath,
  ColorScaleOptions,
  LayerBundle,
  ScaleRange,
} from '../types';

const FALLBACK_SCALE: ScaleRange = { min: 0, max: 1 };

function emptyFc(): FeatureCollection {
  return { type: 'FeatureCollection', features: [] };
}

function safeRange(values: readonly number[], trimPct: number): ScaleRange {
  if (values.length === 0) return FALLBACK_SCALE;
  return trimmedRange(values, trimPct);
}

/**
 * Plan 1 produces only the LayerBundle's scales plus empty placeholder
 * FeatureCollections. The actual grid-resampling + d3-contour rendering for
 * each layer is implemented in Plan 2's `src/map/layers/*.ts` modules and
 * threaded back through this function in that plan.
 */
export function buildLayers(
  clean: CleanBath,
  cells: CategorisedCells,
  colorScale: ColorScaleOptions,
): LayerBundle {
  const depths = clean.rows.map((r) => r.depth_m);
  const weeds = cells.rows.map((c) => c.mean_weed);
  const fishRates = cells.rows.map((c) => c.fish_rate);

  return {
    bathymetry: emptyFc(),
    weed: emptyFc(),
    fishDensity: emptyFc(),
    sweetSpots: emptyFc(),
    scales: {
      depth: safeRange(depths, colorScale.outlierTrimPct),
      weed: safeRange(weeds, colorScale.outlierTrimPct),
      fishRate: safeRange(fishRates, colorScale.outlierTrimPct),
    },
  };
}
