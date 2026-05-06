import { describe, expect, it } from 'vitest';
import type {
  StoredRawFile,
  StoredScan,
  StoredScanResults,
} from '../types';

describe('storage types', () => {
  it('StoredScan carries metadata + thresholds + UI state', () => {
    const s: StoredScan = {
      id: '11111111-1111-1111-1111-111111111111',
      name: 'Cemex 2025-04-12',
      deviceType: 'quest',
      contentHash: 'abc123',
      createdAt: 1700000000000,
      updatedAt: 1700000000000,
      fileMeta: [{ name: 'bathymetry.csv', byteSize: 1024, sha256: 'hh' }],
      thresholds: {
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
      layerVisibility: {
        bathymetry: true,
        weed: true,
        fishDensity: true,
        sweetSpots: true,
      },
      baseLayer: 'osm',
    };
    expect(s.deviceType).toBe('quest');
  });

  it('StoredRawFile holds a Blob', () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])]);
    const f: StoredRawFile = {
      scanId: '11111111-1111-1111-1111-111111111111',
      fileName: 'bathymetry.csv',
      blob,
    };
    expect(f.blob).toBeInstanceOf(Blob);
  });

  it('StoredScanResults caches a LayerBundle for a bundleVersion', () => {
    const r: StoredScanResults = {
      scanId: '11111111-1111-1111-1111-111111111111',
      bundleVersion: 1,
      builtAt: 1700000000000,
      bundle: {
        bathymetry: { type: 'FeatureCollection', features: [] },
        weed: { type: 'FeatureCollection', features: [] },
        fishDensity: { type: 'FeatureCollection', features: [] },
        sweetSpots: { type: 'FeatureCollection', features: [] },
        scales: {
          depth: { min: 0, max: 1 },
          weed: { min: 0, max: 1 },
          fishRate: { min: 0, max: 1 },
        },
      },
    };
    expect(r.bundleVersion).toBe(1);
  });
});
