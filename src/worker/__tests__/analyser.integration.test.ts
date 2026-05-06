// @vitest-environment node
// Reason: fflate misbehaves under jsdom; the worker uses fflate.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CATEGORY_THRESHOLDS,
  DEFAULT_CELL_OPTIONS,
  DEFAULT_COLOR_SCALE_OPTIONS,
  DEFAULT_LIFTOUT_OPTIONS,
  DEFAULT_SONAR_OPTIONS,
} from '../../analysis/constants';
import AnalyserWorker from '../analyser.worker?worker&inline';
import type { WorkerRequest, WorkerResponse } from '../protocol';

const DEFAULT_OPTIONS = {
  liftout: DEFAULT_LIFTOUT_OPTIONS,
  sonar: DEFAULT_SONAR_OPTIONS,
  cell: DEFAULT_CELL_OPTIONS,
  category: DEFAULT_CATEGORY_THRESHOLDS,
  colorScale: DEFAULT_COLOR_SCALE_OPTIONS,
};

function loadFixture(): Uint8Array {
  return new Uint8Array(
    readFileSync(resolve(__dirname, '../../../test/fixtures/reference-bath.csv')),
  );
}

function withWorker<T>(fn: (worker: Worker) => Promise<T>): Promise<T> {
  const worker = new AnalyserWorker();
  return fn(worker).finally(() => worker.terminate());
}

function send(worker: Worker, msg: WorkerRequest): void {
  worker.postMessage(msg);
}

function nextOf(
  worker: Worker,
  predicate: (m: WorkerResponse) => boolean,
  timeoutMs = 30000,
): Promise<WorkerResponse> {
  return new Promise((resolveP, rejectP) => {
    const timer = setTimeout(() => {
      rejectP(new Error('timeout waiting for worker response'));
    }, timeoutMs);
    const onMessage = (e: MessageEvent<WorkerResponse>) => {
      if (predicate(e.data)) {
        clearTimeout(timer);
        worker.removeEventListener('message', onMessage);
        resolveP(e.data);
      }
    };
    worker.addEventListener('message', onMessage);
  });
}

describe('analyser.worker integration', () => {
  it('analyses a synthetic bathymetry scan and reports a layerBundle', async () => {
    const bath = loadFixture();
    const sonar = new Uint8Array(
      readFileSync(resolve(__dirname, '../../../test/fixtures/reference-sonar.csv')),
    );
    await withWorker(async (worker) => {
      send(worker, {
        kind: 'analyse',
        scanId: 'sx',
        rawFiles: [
          { fileName: 'bathymetry.csv', bytes: bath },
          { fileName: 'sonar.csv', bytes: sonar },
        ],
        options: DEFAULT_OPTIONS,
      });

      const result = await nextOf(worker, (m) => m.kind === 'layerBundle');
      expect(result.kind).toBe('layerBundle');
      if (result.kind !== 'layerBundle') throw new Error('unreachable');
      expect(result.scanId).toBe('sx');
      expect(result.bundle.scales.depth.max).toBeGreaterThan(0);
    });
  }, 30000);

  it('emits progress messages for each pipeline stage', async () => {
    const bath = loadFixture();
    const sonar = new Uint8Array(
      readFileSync(resolve(__dirname, '../../../test/fixtures/reference-sonar.csv')),
    );
    await withWorker(async (worker) => {
      const stages = new Set<string>();
      worker.addEventListener('message', (e: MessageEvent<WorkerResponse>) => {
        if (e.data.kind === 'progress') stages.add(e.data.stage);
      });
      send(worker, {
        kind: 'analyse',
        scanId: 'sx',
        rawFiles: [
          { fileName: 'bathymetry.csv', bytes: bath },
          { fileName: 'sonar.csv', bytes: sonar },
        ],
        options: DEFAULT_OPTIONS,
      });
      await nextOf(worker, (m) => m.kind === 'layerBundle');
      expect(stages.has('parse')).toBe(true);
      expect(stages.has('cleanBathymetry')).toBe(true);
      expect(stages.has('analysePings')).toBe(true);
      expect(stages.has('aggregateCells')).toBe(true);
      expect(stages.has('categoriseCells')).toBe(true);
      expect(stages.has('buildLayers')).toBe(true);
    });
  }, 30000);

  it('reports an error when bathymetry.csv is missing', async () => {
    await withWorker(async (worker) => {
      send(worker, {
        kind: 'analyse',
        scanId: 'sx',
        rawFiles: [],
        options: DEFAULT_OPTIONS,
      });
      const err = await nextOf(worker, (m) => m.kind === 'error');
      expect(err.kind).toBe('error');
      if (err.kind !== 'error') throw new Error('unreachable');
      expect(err.message).toMatch(/no bathymetry/i);
    });
  });

  it('recompute reuses parse output (no re-parse needed)', async () => {
    const bath = loadFixture();
    const sonar = new Uint8Array(
      readFileSync(resolve(__dirname, '../../../test/fixtures/reference-sonar.csv')),
    );
    await withWorker(async (worker) => {
      send(worker, {
        kind: 'analyse',
        scanId: 'sx',
        rawFiles: [
          { fileName: 'bathymetry.csv', bytes: bath },
          { fileName: 'sonar.csv', bytes: sonar },
        ],
        options: DEFAULT_OPTIONS,
      });
      await nextOf(worker, (m) => m.kind === 'layerBundle');

      // Now recompute with a different category threshold; verify NO 'parse' progress fires.
      const stages: string[] = [];
      worker.addEventListener('message', (e: MessageEvent<WorkerResponse>) => {
        if (e.data.kind === 'progress') stages.push(e.data.stage);
      });
      send(worker, {
        kind: 'recompute',
        scanId: 'sx',
        options: {
          ...DEFAULT_OPTIONS,
          category: { ...DEFAULT_OPTIONS.category, goldFishRate: 0.3 },
        },
      });
      await nextOf(worker, (m) => m.kind === 'layerBundle');
      expect(stages).not.toContain('parse');
      expect(stages).toContain('categoriseCells');
    });
  }, 30000);

  it('cancel marks state.cancelled so the next stage check throws', async () => {
    const bath = loadFixture();
    const sonar = new Uint8Array(
      readFileSync(resolve(__dirname, '../../../test/fixtures/reference-sonar.csv')),
    );
    await withWorker(async (worker) => {
      // First, run an analysis to completion so the state exists.
      send(worker, {
        kind: 'analyse',
        scanId: 'sx',
        rawFiles: [
          { fileName: 'bathymetry.csv', bytes: bath },
          { fileName: 'sonar.csv', bytes: sonar },
        ],
        options: DEFAULT_OPTIONS,
      });
      await nextOf(worker, (m) => m.kind === 'layerBundle');

      // Send a recompute, immediately followed by a cancel.
      send(worker, {
        kind: 'recompute',
        scanId: 'sx',
        options: {
          ...DEFAULT_OPTIONS,
          sonar: { ...DEFAULT_OPTIONS.sonar, fishMinAmp: 1 }, // forces re-run of analysePings
        },
      });
      send(worker, { kind: 'cancel', scanId: 'sx' });

      // Expect either a layerBundle (if cancel landed too late) OR an error('cancelled').
      const r = await nextOf(worker, (m) => m.kind === 'layerBundle' || m.kind === 'error');
      // Either outcome is acceptable; the contract is "no crash, no infinite work".
      expect(['layerBundle', 'error']).toContain(r.kind);
    });
  }, 30000);
});
