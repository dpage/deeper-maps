import { parseQuestUpload } from '../analysis/parsers/zip';
import { aggregateCells } from '../analysis/pipeline/aggregateCells';
import { analysePings } from '../analysis/pipeline/analysePings';
import { buildLayers } from '../analysis/pipeline/buildLayers';
import { categoriseCells } from '../analysis/pipeline/categoriseCells';
import { cleanBathymetry } from '../analysis/pipeline/cleanBathymetry';
import { memoizeStage } from '../analysis/pipeline/memoize';
import type { RawScan } from '../analysis/parsers/types';
import type { CategorisedCells, CleanBath, PerPing } from '../analysis/types';
import type {
  AnalyseRequest,
  PipelineStage,
  RecomputeRequest,
  WorkerRequest,
  WorkerResponse,
} from './protocol';

interface ScanState {
  raw: RawScan;
  warnings: string[];
  cleaned?: CleanBath;
  perPing?: PerPing;
  cells?: CategorisedCells;
  cancelled: boolean;
}

class Cancelled extends Error {
  constructor() {
    super('cancelled');
  }
}

const states = new Map<string, ScanState>();

// Stage memoisation: one cache per stage, shared across scans (keyed by inputs).
// Each stage is a pure function so memoising at the function level is correct.
const memoCleanBath = memoizeStage(cleanBathymetry);
const memoAnalysePings = memoizeStage(analysePings);
const memoAggregateCells = memoizeStage(aggregateCells);
const memoCategoriseCells = memoizeStage(categoriseCells);
const memoBuildLayers = memoizeStage(buildLayers);

function post(msg: WorkerResponse): void {
  (self as unknown as Worker).postMessage(msg);
}

function reportProgress(
  scanId: string,
  stage: PipelineStage,
  processed: number,
  total: number,
): void {
  post({ kind: 'progress', scanId, stage, processed, total });
}

async function handleAnalyse(req: AnalyseRequest): Promise<void> {
  const { scanId } = req;
  // Pre-register so a cancel arriving during parse can be honoured.
  // (Without this, states.get(scanId) returns undefined while parseQuestUpload
  // is awaiting and the cancel is silently dropped.)
  const placeholder: ScanState = {
    raw: { device: 'quest', bathymetry: [], sonar: [], source: [] },
    warnings: [],
    cancelled: false,
  };
  states.set(scanId, placeholder);
  try {
    reportProgress(scanId, 'parse', 0, 1);
    const { scan: raw, warnings } = await parseQuestUpload(req.rawFiles);
    // If a cancel arrived during parse, abort now.
    if (placeholder.cancelled) {
      post({ kind: 'cancelled', scanId });
      return;
    }
    placeholder.raw = raw;
    placeholder.warnings = warnings;
    reportProgress(scanId, 'parse', 1, 1);

    runPipeline(scanId, req.options);
  } catch (err) {
    if (err instanceof Cancelled) {
      post({ kind: 'cancelled', scanId });
      return;
    }
    postError(scanId, err);
  }
}

async function handleRecompute(req: RecomputeRequest): Promise<void> {
  const state = states.get(req.scanId);
  if (!state) {
    post({
      kind: 'error',
      scanId: req.scanId,
      message: 'No analysed scan with that id; send analyse first',
    });
    return;
  }
  // Reset cancelled in case a previous run left it true.
  state.cancelled = false;
  // Defer to next microtask so callers awaiting the response can register
  // listeners before the (synchronous) pipeline starts firing messages.
  await Promise.resolve();
  try {
    runPipeline(req.scanId, req.options);
  } catch (err) {
    if (err instanceof Cancelled) {
      post({ kind: 'cancelled', scanId: req.scanId });
      return;
    }
    postError(req.scanId, err);
  }
}

function postError(scanId: string, err: unknown): void {
  const e = err as Error;
  if (e.stack !== undefined) {
    post({ kind: 'error', scanId, message: e.message, stack: e.stack });
  } else {
    post({ kind: 'error', scanId, message: e.message });
  }
}

function runPipeline(scanId: string, options: AnalyseRequest['options']): void {
  const state = states.get(scanId);
  if (!state) return;

  const checkCancelled = () => {
    if (state.cancelled) {
      throw new Cancelled();
    }
  };

  reportProgress(scanId, 'cleanBathymetry', 0, 1);
  const cleaned = memoCleanBath(state.raw.bathymetry, options.liftout, 0);
  state.cleaned = cleaned;
  reportProgress(scanId, 'cleanBathymetry', 1, 1);
  checkCancelled();

  reportProgress(scanId, 'analysePings', 0, state.raw.sonar.length);
  const perPing = memoAnalysePings(state.raw.sonar, cleaned.rows, options.sonar);
  state.perPing = perPing;
  reportProgress(scanId, 'analysePings', state.raw.sonar.length, state.raw.sonar.length);
  checkCancelled();

  reportProgress(scanId, 'aggregateCells', 0, perPing.rows.length);
  const cells = memoAggregateCells(perPing, options.cell);
  reportProgress(scanId, 'aggregateCells', perPing.rows.length, perPing.rows.length);
  checkCancelled();

  reportProgress(scanId, 'categoriseCells', 0, cells.rows.length);
  const categorised = memoCategoriseCells(cells, options.category);
  state.cells = categorised;
  reportProgress(scanId, 'categoriseCells', cells.rows.length, cells.rows.length);
  checkCancelled();

  reportProgress(scanId, 'buildLayers', 0, 1);
  const bundle = memoBuildLayers(cleaned, categorised, options.colorScale);
  reportProgress(scanId, 'buildLayers', 1, 1);

  post({ kind: 'layerBundle', scanId, bundle, warnings: state.warnings });
}

self.addEventListener('message', (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;
  switch (req.kind) {
    case 'analyse':
      void handleAnalyse(req);
      break;
    case 'recompute':
      void handleRecompute(req);
      break;
    case 'cancel': {
      const state = states.get(req.scanId);
      if (state) state.cancelled = true;
      break;
    }
  }
});

export {};
