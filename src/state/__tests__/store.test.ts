import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Blob as NodeBlob } from 'node:buffer';
import { closeDeeperMapsDb } from '../../storage/db';
import { loadScanResults, saveScan, saveScanResults } from '../../storage/scans';
import {
  DEFAULT_CATEGORY_THRESHOLDS,
  DEFAULT_CELL_OPTIONS,
  DEFAULT_COLOR_SCALE_OPTIONS,
  DEFAULT_LIFTOUT_OPTIONS,
  DEFAULT_SONAR_OPTIONS,
} from '../../analysis/constants';
import {
  __attachWorkerListener,
  __getWorkerMessageListener,
  __resetDebounceTimer,
  useDeeperMapsStore,
} from '../store';
import type { StoredScan } from '../../storage/types';
import type { LayerBundle } from '../../analysis/types';
import type { WorkerResponse } from '../../worker/protocol';

const DEFAULT_THRESHOLDS = {
  liftout: DEFAULT_LIFTOUT_OPTIONS,
  sonar: DEFAULT_SONAR_OPTIONS,
  cell: DEFAULT_CELL_OPTIONS,
  category: DEFAULT_CATEGORY_THRESHOLDS,
  colorScale: DEFAULT_COLOR_SCALE_OPTIONS,
};

function makeScan(id: string, name: string, contentHash: string): StoredScan {
  return {
    id,
    name,
    deviceType: 'quest',
    contentHash,
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
    fileMeta: [],
    thresholds: DEFAULT_THRESHOLDS,
    layerVisibility: { bathymetry: true, weed: true, fishDensity: true, sweetSpots: true },
    baseLayer: 'osm',
  };
}

function emptyBundle(): LayerBundle {
  return {
    bathymetry: { type: 'FeatureCollection', features: [] },
    weed: { type: 'FeatureCollection', features: [] },
    fishDensity: { type: 'FeatureCollection', features: [] },
    sweetSpots: { type: 'FeatureCollection', features: [] },
    scales: {
      depth: { min: 0, max: 1 },
      weed: { min: 0, max: 1 },
      fishRate: { min: 0, max: 1 },
    },
  };
}

interface WorkerStub {
  postMessage: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  terminate: ReturnType<typeof vi.fn>;
}

function makeWorkerStub(): WorkerStub {
  return {
    postMessage: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    terminate: vi.fn(),
  };
}

function getStubbedPostMessage(): ReturnType<typeof vi.fn> {
  return (globalThis.__deeperMapsWorker as unknown as WorkerStub).postMessage;
}

function deliverWorkerMessage(msg: WorkerResponse): void {
  const listener = __getWorkerMessageListener();
  if (!listener) throw new Error('no listener attached');
  listener({ data: msg } as MessageEvent<WorkerResponse>);
}

beforeEach(async () => {
  await closeDeeperMapsDb();
  indexedDB.deleteDatabase('deeper-maps');
  // Reset store between tests
  useDeeperMapsStore.setState({
    scans: {},
    activeScanId: null,
    layerBundle: null,
    progress: null,
    warnings: [],
  });
  __resetDebounceTimer();
  // Stub the worker — the store dispatches messages via globalThis.__deeperMapsWorker
  globalThis.__deeperMapsWorker = makeWorkerStub() as unknown as Worker;
  __attachWorkerListener();
});

afterEach(async () => {
  __resetDebounceTimer();
  await closeDeeperMapsDb();
});

describe('useDeeperMapsStore', () => {
  it('hydrate() loads the persisted scans index', async () => {
    const a = makeScan('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Old', 'hashA');
    const b = makeScan('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Recent', 'hashB');
    a.updatedAt = 1700000000000;
    b.updatedAt = 1700000050000;
    await saveScan(a, []);
    await saveScan(b, []);

    await useDeeperMapsStore.getState().hydrate();

    const { scans } = useDeeperMapsStore.getState();
    expect(Object.keys(scans).sort()).toEqual([a.id, b.id].sort());
  });

  it('setActiveScan switches the active id and clears in-flight state', async () => {
    const a = makeScan('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A', 'hashA');
    await saveScan(a, []);
    await useDeeperMapsStore.getState().hydrate();

    // Seed some progress to confirm setActiveScan resets it.
    useDeeperMapsStore.setState({
      progress: { stage: 'parse', processed: 1, total: 2 },
      layerBundle: emptyBundle(),
    });

    await useDeeperMapsStore.getState().setActiveScan(a.id);

    const s = useDeeperMapsStore.getState();
    expect(s.activeScanId).toBe(a.id);
    expect(s.progress).toBeNull();
    // No cache, no raw files → worker dispatched.
    expect(getStubbedPostMessage()).toHaveBeenCalledTimes(1);
    expect(getStubbedPostMessage().mock.calls[0]?.[0]).toMatchObject({
      kind: 'analyse',
      scanId: a.id,
    });
  });

  it('setActiveScan(null) clears the active id without touching the worker', async () => {
    await useDeeperMapsStore.getState().setActiveScan(null);
    expect(useDeeperMapsStore.getState().activeScanId).toBeNull();
    expect(getStubbedPostMessage()).not.toHaveBeenCalled();
  });

  it('setActiveScan is a no-op for an unknown id', async () => {
    await useDeeperMapsStore.getState().setActiveScan('zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz');
    expect(useDeeperMapsStore.getState().activeScanId).toBe('zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz');
    expect(getStubbedPostMessage()).not.toHaveBeenCalled();
  });

  it('setActiveScan restores cached results without dispatching the worker', async () => {
    const a = makeScan('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A', 'hashA');
    await saveScan(a, []);
    const bundle = emptyBundle();
    await saveScanResults({ scanId: a.id, bundleVersion: 1, builtAt: 0, bundle });
    await useDeeperMapsStore.getState().hydrate();

    await useDeeperMapsStore.getState().setActiveScan(a.id);

    expect(useDeeperMapsStore.getState().layerBundle).toEqual(bundle);
    expect(getStubbedPostMessage()).not.toHaveBeenCalled();
  });

  it('saveAndAnalyse persists, sets active, and dispatches an analyse request', async () => {
    const a = makeScan('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A', 'hashA');
    const blob = new NodeBlob([new Uint8Array([1, 2, 3])]) as unknown as Blob;

    await useDeeperMapsStore.getState().saveAndAnalyse(a, [{ fileName: 'bathymetry.csv', blob }]);

    expect(useDeeperMapsStore.getState().activeScanId).toBe(a.id);
    expect(useDeeperMapsStore.getState().scans[a.id]?.id).toBe(a.id);
    const post = getStubbedPostMessage();
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0]?.[0]).toMatchObject({
      kind: 'analyse',
      scanId: a.id,
      options: a.thresholds,
    });
  });

  it('updateThresholds debounces worker dispatch', async () => {
    // IDB setup must happen under real timers — fake-indexeddb's transaction
    // microtasks rely on the runtime's real timer queue.
    const a = makeScan('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A', 'hashA');
    await saveScan(a, []);
    await useDeeperMapsStore.getState().hydrate();

    const post = getStubbedPostMessage();
    post.mockClear();

    vi.useFakeTimers();
    try {
      const next = {
        ...DEFAULT_THRESHOLDS,
        category: { ...DEFAULT_THRESHOLDS.category, goldFishRate: 0.3 },
      };
      useDeeperMapsStore.getState().updateThresholds(a.id, next);
      useDeeperMapsStore.getState().updateThresholds(a.id, next);
      useDeeperMapsStore.getState().updateThresholds(a.id, next);

      expect(post).not.toHaveBeenCalled();
      vi.advanceTimersByTime(199);
      expect(post).not.toHaveBeenCalled();
      vi.advanceTimersByTime(2);
      expect(post).toHaveBeenCalledTimes(1);
      expect(post.mock.calls[0]?.[0]).toMatchObject({
        kind: 'recompute',
        scanId: a.id,
        options: next,
      });
    } finally {
      vi.useRealTimers();
    }
    // The debounce callback fires `void persistScan(scan)` which kicks off
    // IDB microtasks that need real timers to settle. Allow them to drain
    // so afterEach's closeDeeperMapsDb doesn't race an in-flight transaction.
    await new Promise<void>((r) => setTimeout(r, 0));
  });

  it('updateThresholds is a no-op for an unknown scan id', () => {
    const before = useDeeperMapsStore.getState().scans;
    useDeeperMapsStore
      .getState()
      .updateThresholds('zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz', DEFAULT_THRESHOLDS);
    expect(useDeeperMapsStore.getState().scans).toBe(before);
  });

  it('updateThresholds drops the recompute when the scan is deleted before the timer fires', async () => {
    const a = makeScan('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A', 'hashA');
    await saveScan(a, []);
    await useDeeperMapsStore.getState().hydrate();
    getStubbedPostMessage().mockClear();

    vi.useFakeTimers();
    try {
      useDeeperMapsStore.getState().updateThresholds(a.id, DEFAULT_THRESHOLDS);
      // Race: scan goes away before debounce fires.
      useDeeperMapsStore.setState({ scans: {} });
      vi.advanceTimersByTime(250);
      expect(getStubbedPostMessage()).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('setLayerVisibility persists and updates store', async () => {
    const a = makeScan('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A', 'hashA');
    await saveScan(a, []);
    await useDeeperMapsStore.getState().hydrate();

    await useDeeperMapsStore.getState().setLayerVisibility(a.id, 'bathymetry', false);

    const stored = useDeeperMapsStore.getState().scans[a.id];
    expect(stored?.layerVisibility.bathymetry).toBe(false);
  });

  it('setLayerVisibility is a no-op for an unknown scan id', async () => {
    await useDeeperMapsStore
      .getState()
      .setLayerVisibility('zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz', 'weed', false);
    expect(useDeeperMapsStore.getState().scans).toEqual({});
  });

  it('setBaseLayer persists and updates store', async () => {
    const a = makeScan('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A', 'hashA');
    await saveScan(a, []);
    await useDeeperMapsStore.getState().hydrate();

    await useDeeperMapsStore.getState().setBaseLayer(a.id, 'satellite');

    expect(useDeeperMapsStore.getState().scans[a.id]?.baseLayer).toBe('satellite');
  });

  it('setBaseLayer is a no-op for an unknown scan id', async () => {
    await useDeeperMapsStore
      .getState()
      .setBaseLayer('zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz', 'satellite');
    expect(useDeeperMapsStore.getState().scans).toEqual({});
  });

  it('renameScan persists to IndexedDB and updates store', async () => {
    const a = makeScan('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A', 'hashA');
    await saveScan(a, []);
    await useDeeperMapsStore.getState().hydrate();

    await useDeeperMapsStore.getState().renameScan(a.id, 'Renamed');

    expect(useDeeperMapsStore.getState().scans[a.id]?.name).toBe('Renamed');
  });

  it('deleteScan removes from store and IndexedDB and clears active state', async () => {
    const a = makeScan('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A', 'hashA');
    await saveScan(a, []);
    await useDeeperMapsStore.getState().hydrate();
    useDeeperMapsStore.setState({ activeScanId: a.id, layerBundle: emptyBundle() });

    await useDeeperMapsStore.getState().deleteScan(a.id);

    const s = useDeeperMapsStore.getState();
    expect(s.scans[a.id]).toBeUndefined();
    expect(s.activeScanId).toBeNull();
    expect(s.layerBundle).toBeNull();
  });

  it('deleteScan leaves activeScanId untouched when a different scan is deleted', async () => {
    const a = makeScan('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A', 'hashA');
    const b = makeScan('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'B', 'hashB');
    await saveScan(a, []);
    await saveScan(b, []);
    await useDeeperMapsStore.getState().hydrate();
    const bundle = emptyBundle();
    useDeeperMapsStore.setState({ activeScanId: a.id, layerBundle: bundle });

    await useDeeperMapsStore.getState().deleteScan(b.id);

    const s = useDeeperMapsStore.getState();
    expect(s.activeScanId).toBe(a.id);
    expect(s.layerBundle).toBe(bundle);
  });
});

describe('useDeeperMapsStore — worker message routing', () => {
  it('routes a progress message into store.progress', () => {
    deliverWorkerMessage({
      kind: 'progress',
      scanId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      stage: 'parse',
      processed: 3,
      total: 10,
    });
    expect(useDeeperMapsStore.getState().progress).toEqual({
      stage: 'parse',
      processed: 3,
      total: 10,
    });
  });

  it('routes a layerBundle message: stores the bundle, clears progress, persists results', async () => {
    const scanId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const bundle = emptyBundle();
    useDeeperMapsStore.setState({
      progress: { stage: 'buildLayers', processed: 1, total: 1 },
    });

    deliverWorkerMessage({
      kind: 'layerBundle',
      scanId,
      bundle,
      warnings: ['heads up'],
    });

    expect(useDeeperMapsStore.getState().layerBundle).toEqual(bundle);
    expect(useDeeperMapsStore.getState().progress).toBeNull();
    expect(useDeeperMapsStore.getState().warnings).toEqual(['heads up']);

    // saveScanResults runs as a fire-and-forget; give it a microtask to settle.
    await new Promise<void>((r) => setTimeout(r, 0));
    const cached = await loadScanResults(scanId);
    expect(cached?.bundle).toEqual(bundle);
  });

  it('routes an error message: clears progress, surfaces the message in warnings', () => {
    useDeeperMapsStore.setState({
      progress: { stage: 'parse', processed: 1, total: 2 },
    });

    deliverWorkerMessage({
      kind: 'error',
      scanId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      message: 'parse failed',
    });

    expect(useDeeperMapsStore.getState().progress).toBeNull();
    expect(useDeeperMapsStore.getState().warnings).toEqual(['parse failed']);
  });

  it('routes a cancelled message: clears progress, leaves bundle and warnings untouched', () => {
    const bundle = emptyBundle();
    useDeeperMapsStore.setState({
      progress: { stage: 'parse', processed: 1, total: 2 },
      layerBundle: bundle,
      warnings: ['existing'],
    });

    deliverWorkerMessage({
      kind: 'cancelled',
      scanId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    });

    const s = useDeeperMapsStore.getState();
    expect(s.progress).toBeNull();
    expect(s.layerBundle).toBe(bundle);
    expect(s.warnings).toEqual(['existing']);
  });
});

describe('useDeeperMapsStore — worker plumbing', () => {
  it('throws if a worker dispatch happens before main.tsx initialises the worker', async () => {
    // Drop the worker stub.
    globalThis.__deeperMapsWorker = undefined;
    const a = makeScan('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A', 'hashA');
    await saveScan(a, []);
    await useDeeperMapsStore.getState().hydrate();
    await expect(useDeeperMapsStore.getState().setActiveScan(a.id)).rejects.toThrow(
      /Analyser worker not initialised/,
    );
  });

  it('__attachWorkerListener is a no-op when no worker is set', () => {
    globalThis.__deeperMapsWorker = undefined;
    // Should not throw.
    expect(() => __attachWorkerListener()).not.toThrow();
  });
});
