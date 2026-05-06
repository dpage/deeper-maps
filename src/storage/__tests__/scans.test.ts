import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Blob as NodeBlob } from 'node:buffer';
import {
  DEFAULT_CATEGORY_THRESHOLDS,
  DEFAULT_CELL_OPTIONS,
  DEFAULT_COLOR_SCALE_OPTIONS,
  DEFAULT_LIFTOUT_OPTIONS,
  DEFAULT_SONAR_OPTIONS,
} from '../../analysis/constants';
import { closeDeeperMapsDb } from '../db';
import {
  deleteScan,
  findScanByContentHash,
  listScans,
  loadScanRawFiles,
  loadScanResults,
  renameScan,
  saveScan,
  saveScanResults,
} from '../scans';
import type { StoredScan } from '../types';

const DEFAULT_THRESHOLDS = {
  liftout: DEFAULT_LIFTOUT_OPTIONS,
  sonar: DEFAULT_SONAR_OPTIONS,
  cell: DEFAULT_CELL_OPTIONS,
  category: DEFAULT_CATEGORY_THRESHOLDS,
  colorScale: DEFAULT_COLOR_SCALE_OPTIONS,
};

function makeScan(overrides: Partial<StoredScan> = {}): StoredScan {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Test Scan',
    deviceType: 'quest',
    contentHash: 'hashA',
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
    fileMeta: [{ name: 'bathymetry.csv', byteSize: 1024, sha256: 'hh' }],
    thresholds: DEFAULT_THRESHOLDS,
    layerVisibility: { bathymetry: true, weed: true, fishDensity: true, sweetSpots: true },
    baseLayer: 'osm',
    ...overrides,
  };
}

beforeEach(async () => {
  await closeDeeperMapsDb();
  indexedDB.deleteDatabase('deeper-maps');
});

afterEach(async () => {
  await closeDeeperMapsDb();
});

describe('scans CRUD', () => {
  it('saves and loads a scan with raw files', async () => {
    const scan = makeScan();
    // jsdom's global Blob is NOT structured-cloneable (fake-indexeddb's
    // structured-clone shim flattens it to {}). node:buffer's Blob IS
    // structured-cloneable, so we use it here to assert real byte-level
    // round-trip — which is the central correctness property of the
    // scanRawFiles store that Phase B's worker depends on.
    const blob = new NodeBlob([new Uint8Array([1, 2, 3])]) as unknown as Blob;
    await saveScan(scan, [{ fileName: 'bathymetry.csv', blob }]);

    const list = await listScans();
    expect(list).toHaveLength(1);
    expect(list[0]?.name).toBe('Test Scan');

    const raws = await loadScanRawFiles(scan.id);
    expect(raws).toHaveLength(1);
    expect(raws[0]?.fileName).toBe('bathymetry.csv');
    const buf = await raws[0]!.blob.arrayBuffer();
    expect(new Uint8Array(buf)).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('finds a scan by content hash', async () => {
    const a = makeScan({ id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', contentHash: 'hashA' });
    const b = makeScan({ id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', contentHash: 'hashB' });
    await saveScan(a, []);
    await saveScan(b, []);

    const found = await findScanByContentHash('hashB');
    expect(found?.id).toBe('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
    expect(await findScanByContentHash('does-not-exist')).toBeUndefined();
  });

  it('renames a scan and bumps updatedAt', async () => {
    const scan = makeScan();
    await saveScan(scan, []);

    await renameScan(scan.id, 'New Name');

    const list = await listScans();
    expect(list[0]?.name).toBe('New Name');
    expect(list[0]?.updatedAt).toBeGreaterThanOrEqual(scan.updatedAt);
  });

  it('renameScan throws when the scan does not exist', async () => {
    await expect(renameScan('does-not-exist', 'x')).rejects.toThrow(/no scan with id/);
  });

  it('deletes a scan along with its raw files and cached results', async () => {
    const scan = makeScan();
    await saveScan(scan, [{ fileName: 'bathymetry.csv', blob: new Blob([new Uint8Array([1])]) }]);
    await saveScanResults({
      scanId: scan.id,
      bundleVersion: 1,
      builtAt: 0,
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
    });

    await deleteScan(scan.id);

    expect(await listScans()).toHaveLength(0);
    expect(await loadScanRawFiles(scan.id)).toHaveLength(0);
    expect(await loadScanResults(scan.id)).toBeUndefined();
  });

  it('saves and loads cached scan results', async () => {
    const scan = makeScan();
    await saveScan(scan, []);

    const bundle = {
      bathymetry: { type: 'FeatureCollection' as const, features: [] },
      weed: { type: 'FeatureCollection' as const, features: [] },
      fishDensity: { type: 'FeatureCollection' as const, features: [] },
      sweetSpots: { type: 'FeatureCollection' as const, features: [] },
      scales: {
        depth: { min: 0.5, max: 2.5 },
        weed: { min: 0, max: 0.3 },
        fishRate: { min: 0, max: 0.5 },
      },
    };
    await saveScanResults({ scanId: scan.id, bundleVersion: 1, builtAt: 1700000000000, bundle });

    const loaded = await loadScanResults(scan.id);
    expect(loaded?.bundle.scales.depth.max).toBe(2.5);
  });

  it('returns scans newest-first in listScans', async () => {
    const old = makeScan({ id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', updatedAt: 1700000000000 });
    const recent = makeScan({
      id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      updatedAt: 1700000050000,
    });
    await saveScan(old, []);
    await saveScan(recent, []);
    const list = await listScans();
    expect(list[0]?.id).toBe('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
    expect(list[1]?.id).toBe('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  });
});
