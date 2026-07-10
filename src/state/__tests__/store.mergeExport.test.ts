// @vitest-environment node
//
// Runs in the NODE environment (not jsdom) for the same reason the parser tests
// do: fflate's `zipSync`/`unzipSync` misbehave under vitest's jsdom module
// transform (a dual-package-identity issue that makes `instanceof Uint8Array`
// fail internally). mergeScan/exportScan build and re-read real zips via fflate,
// so they must run where fflate is sound.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Blob as NodeBlob } from 'node:buffer';
import { strToU8, unzipSync, zipSync } from 'fflate';
import { closeDeeperMapsDb } from '../../storage/db';
import { loadScanRawFiles, saveScan } from '../../storage/scans';
import {
  DEFAULT_CATEGORY_THRESHOLDS,
  DEFAULT_CELL_OPTIONS,
  DEFAULT_COLOR_SCALE_OPTIONS,
  DEFAULT_LIFTOUT_OPTIONS,
  DEFAULT_SONAR_OPTIONS,
} from '../../analysis/constants';
import { __attachWorkerListener, useDeeperMapsStore } from '../store';
import type { StoredScan } from '../../storage/types';

const DEFAULT_THRESHOLDS = {
  liftout: DEFAULT_LIFTOUT_OPTIONS,
  sonar: DEFAULT_SONAR_OPTIONS,
  cell: DEFAULT_CELL_OPTIONS,
  category: DEFAULT_CATEGORY_THRESHOLDS,
  colorScale: DEFAULT_COLOR_SCALE_OPTIONS,
};

const A_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function makeScan(overrides: Partial<StoredScan> = {}): StoredScan {
  return {
    id: A_ID,
    name: 'Lake A',
    deviceType: 'quest',
    contentHash: 'hashA',
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
    fileMeta: [],
    thresholds: DEFAULT_THRESHOLDS,
    layerVisibility: {
      bathymetry: true,
      weed: true,
      fishDensity: true,
      sweetSpots: true,
      temperature: false,
    },
    ...overrides,
  };
}

/** A valid Quest export zip (bathymetry + sonar) with GPS-tagged rows. */
function validScanZip(baseTs: number): Uint8Array {
  const bath =
    Array.from({ length: 5 }, (_, i) => `51.7,-1.43,1.5,18.4,${baseTs + i * 67}`).join('\n') + '\n';
  const sonar =
    Array.from(
      { length: 5 },
      (_, i) => `${baseTs + i * 67},${[0, 0, 0, 5, 12, 40, 200, 500].join(',')}`,
    ).join('\n') + '\n';
  return zipSync({ 'bathymetry.csv': strToU8(bath), 'sonar.csv': strToU8(sonar) });
}

function storedBlob(bytes: Uint8Array): Blob {
  // node:buffer Blob survives fake-indexeddb's structured clone; copy to a tight
  // buffer so the whole (possibly over-allocated) fflate backing store isn't
  // serialised.
  return new NodeBlob([Uint8Array.from(bytes)]) as unknown as Blob;
}

beforeEach(async () => {
  await closeDeeperMapsDb();
  indexedDB.deleteDatabase('deeper-maps');
  globalThis.__deeperMapsWorker = {
    postMessage: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    terminate: vi.fn(),
  } as unknown as Worker;
  useDeeperMapsStore.setState({
    scans: {},
    activeScanId: null,
    layerBundle: null,
    progress: null,
    warnings: [],
    baseLayer: 'osm',
    frameRequestSeq: 0,
  });
  __attachWorkerListener();
});

afterEach(async () => {
  await closeDeeperMapsDb();
});

describe('mergeScan', () => {
  it('combines the upload into the target, replaces the raw archive, and re-activates it', async () => {
    const a = makeScan({ fileMeta: [{ name: 'a.zip', byteSize: 10, sha256: 'x' }] });
    await saveScan(a, [{ fileName: 'a.zip', blob: storedBlob(validScanZip(1717000000000)) }]);
    await useDeeperMapsStore.getState().hydrate();

    await useDeeperMapsStore.getState().mergeScan(a.id, {
      fileName: 'b.zip',
      bytes: validScanZip(1717000000000 + 86_400_000),
    });

    // The pre-merge archive is replaced by a single combined one (no double count).
    const raws = await loadScanRawFiles(a.id);
    expect(raws.map((r) => r.fileName)).toEqual(['merged-scan.zip']);

    // The combined archive re-imports as a bathymetry+sonar zip holding both scans.
    const mergedBytes = new Uint8Array(await raws[0]!.blob.arrayBuffer());
    const entries = unzipSync(mergedBytes);
    expect(Object.keys(entries).sort()).toEqual(['bathymetry.csv', 'sonar.csv']);
    const bathLines = new TextDecoder().decode(entries['bathymetry.csv']).trim().split('\n');
    expect(bathLines).toHaveLength(10); // 5 + 5

    const updated = useDeeperMapsStore.getState().scans[a.id];
    expect(updated?.fileMeta).toHaveLength(2);
    expect(updated?.fileMeta[1]?.name).toBe('b.zip');
    expect(updated?.contentHash).not.toBe('hashA');
    // Re-activated and re-analysed from the merged archive.
    expect(useDeeperMapsStore.getState().activeScanId).toBe(a.id);
    const post = (
      globalThis.__deeperMapsWorker as unknown as { postMessage: ReturnType<typeof vi.fn> }
    ).postMessage;
    expect(post.mock.calls.some((c) => (c[0] as { kind: string }).kind === 'analyse')).toBe(true);
  });

  it('preserves bathymetry-only status when neither scan has sonar', async () => {
    const bathOnly = (baseTs: number): Uint8Array =>
      zipSync({
        'bathymetry.csv': strToU8(
          Array.from({ length: 5 }, (_, i) => `51.7,-1.43,1.5,18.4,${baseTs + i * 67}`).join('\n') +
            '\n',
        ),
      });
    const a = makeScan();
    await saveScan(a, [{ fileName: 'a.zip', blob: storedBlob(bathOnly(1717000000000)) }]);
    await useDeeperMapsStore.getState().hydrate();

    await useDeeperMapsStore
      .getState()
      .mergeScan(a.id, { fileName: 'b.zip', bytes: bathOnly(1717000000000 + 86_400_000) });

    const raws = await loadScanRawFiles(a.id);
    const entries = unzipSync(new Uint8Array(await raws[0]!.blob.arrayBuffer()));
    expect(Object.keys(entries)).toEqual(['bathymetry.csv']);
  });

  it('throws for an unknown target scan', async () => {
    await expect(
      useDeeperMapsStore.getState().mergeScan('zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz', {
        fileName: 'b.zip',
        bytes: validScanZip(1717000000000),
      }),
    ).rejects.toThrow(/no scan with id/);
  });

  it('surfaces a clear error when the uploaded file has no bathymetry.csv', async () => {
    const a = makeScan();
    await saveScan(a, [{ fileName: 'a.zip', blob: storedBlob(validScanZip(1717000000000)) }]);
    await useDeeperMapsStore.getState().hydrate();

    const junk = zipSync({ 'sonar.csv': strToU8('1,2,3\n') });
    await expect(
      useDeeperMapsStore.getState().mergeScan(a.id, { fileName: 'b.zip', bytes: junk }),
    ).rejects.toThrow(/no bathymetry/i);
  });
});

describe('exportScan', () => {
  it('builds a re-importable bathymetry+sonar zip named after the scan', async () => {
    const a = makeScan({ name: 'My Lake' });
    await saveScan(a, [{ fileName: 'a.zip', blob: storedBlob(validScanZip(1717000000000)) }]);
    await useDeeperMapsStore.getState().hydrate();

    const { blob, fileName } = await useDeeperMapsStore.getState().exportScan(a.id);
    expect(fileName).toBe('My Lake.zip');
    const entries = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    expect(Object.keys(entries).sort()).toEqual(['bathymetry.csv', 'sonar.csv']);
  });

  it('sanitises filesystem-unsafe characters in the scan name', async () => {
    const a = makeScan({ name: 'Lake/Pond: "big"' });
    await saveScan(a, [{ fileName: 'a.zip', blob: storedBlob(validScanZip(1717000000000)) }]);
    await useDeeperMapsStore.getState().hydrate();

    const { fileName } = await useDeeperMapsStore.getState().exportScan(a.id);
    expect(fileName).toBe('Lake_Pond_ _big_.zip');
  });

  it('throws for an unknown scan id', async () => {
    await expect(
      useDeeperMapsStore.getState().exportScan('zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz'),
    ).rejects.toThrow(/no scan with id/);
  });
});
