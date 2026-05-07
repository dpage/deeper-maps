import { describe, expect, it } from 'vitest';
import type {
  AnalyseRequest,
  CancelledResponse,
  CancelRequest,
  ErrorResponse,
  LayerBundleResponse,
  ProgressResponse,
  WorkerRequest,
  WorkerResponse,
} from '../protocol';

describe('worker protocol', () => {
  it('AnalyseRequest carries scanId, raw files, and pipeline options', () => {
    const r: AnalyseRequest = {
      kind: 'analyse',
      scanId: '11111111-1111-1111-1111-111111111111',
      rawFiles: [{ fileName: 'bathymetry.csv', bytes: new Uint8Array([1, 2, 3]) }],
      options: {
        liftout: {
          hardThresholdM: 5,
          rollingWindow: 31,
          madMultiplier: 6,
          madOffsetM: 0.3,
          sessionGapS: 300,
        },
        sonar: {
          binsPerM: 576.6,
          ringdownBins: 30,
          bottomHugM: 0.25,
          weedAmpFactor: 4,
          weedMinAmp: 30,
          fishAmpFactor: 10,
          fishMinAmp: 200,
          fishMinRun: 3,
        },
        cell: { cellSizeM: 2, minPingsPerCell: 3 },
        category: {
          goldFishRate: 0.1,
          goldMaxWeed: 0.05,
          silverMaxWeed: 0.15,
          bronzeFishRate: 0.05,
          bronzeMaxWeed: 0.15,
          weededMinWeed: 0.15,
        },
        colorScale: { outlierTrimPct: 1.0 },
      },
    };
    expect(r.kind).toBe('analyse');
  });

  it('CancelRequest names the scan being cancelled', () => {
    const c: CancelRequest = { kind: 'cancel', scanId: 'x' };
    expect(c.kind).toBe('cancel');
  });

  it('ProgressResponse reports stage + counters', () => {
    const p: ProgressResponse = {
      kind: 'progress',
      scanId: 'x',
      stage: 'analysePings',
      processed: 100,
      total: 1000,
    };
    expect(p.processed).toBe(100);
  });

  it('LayerBundleResponse carries the final result', () => {
    const r: LayerBundleResponse = {
      kind: 'layerBundle',
      scanId: 'x',
      bundle: {
        bathymetry: { type: 'FeatureCollection', features: [] },
        weed: { type: 'FeatureCollection', features: [] },
        weedLines: { type: 'FeatureCollection', features: [] },
        fishDensity: { type: 'FeatureCollection', features: [] },
        sweetSpots: { type: 'FeatureCollection', features: [] },
        scales: {
          depth: { min: 0, max: 1 },
          weed: { min: 0, max: 1 },
          fishRate: { min: 0, max: 1 },
        },
        bounds: null,
      },
      warnings: [],
    };
    expect(r.kind).toBe('layerBundle');
  });

  it('ErrorResponse carries a human-readable message + optional stack', () => {
    const e: ErrorResponse = {
      kind: 'error',
      scanId: 'x',
      message: 'parse failed',
      stack: 'at parser:1:2',
    };
    expect(e.kind).toBe('error');
  });

  it('CancelledResponse names the scan that was cancelled', () => {
    const c: CancelledResponse = { kind: 'cancelled', scanId: 'x' };
    expect(c.kind).toBe('cancelled');
  });

  it('discriminated unions narrow correctly', () => {
    const messages: WorkerResponse[] = [
      {
        kind: 'progress',
        scanId: 'x',
        stage: 'parse',
        processed: 1,
        total: 5,
      },
      {
        kind: 'layerBundle',
        scanId: 'x',
        bundle: {
          bathymetry: { type: 'FeatureCollection', features: [] },
          weed: { type: 'FeatureCollection', features: [] },
          weedLines: { type: 'FeatureCollection', features: [] },
          fishDensity: { type: 'FeatureCollection', features: [] },
          sweetSpots: { type: 'FeatureCollection', features: [] },
          scales: {
            depth: { min: 0, max: 1 },
            weed: { min: 0, max: 1 },
            fishRate: { min: 0, max: 1 },
          },
          bounds: null,
        },
        warnings: [],
      },
      { kind: 'error', scanId: 'x', message: 'oops' },
      { kind: 'cancelled', scanId: 'x' },
    ];
    let progressCount = 0;
    for (const m of messages) {
      if (m.kind === 'progress') {
        progressCount += m.processed;
      }
    }
    expect(progressCount).toBe(1);

    const _r: WorkerRequest = { kind: 'cancel', scanId: 'x' };
    expect(_r.kind).toBe('cancel');
  });
});
