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
  __getWorkerErrorListener,
  __getWorkerMessageListener,
  __resetDebounceTimer,
  useDeeperMapsStore,
} from '../store';
import type { StoredScan } from '../../storage/types';
import { CURRENT_BUNDLE_VERSION, type LayerBundle } from '../../analysis/types';
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
    layerVisibility: {
      bathymetry: true,
      weed: true,
      fishDensity: true,
      sweetSpots: true,
      temperature: false,
    },
  };
}

function emptyBundle(): LayerBundle {
  return {
    bathymetry: { type: 'FeatureCollection', features: [] },
    weed: { type: 'FeatureCollection', features: [] },
    bathymetryLines: { type: 'FeatureCollection', features: [] },
    fishDensity: { type: 'FeatureCollection', features: [] },
    sweetSpots: { type: 'FeatureCollection', features: [] },
    temperature: { type: 'FeatureCollection', features: [] },
    scales: {
      depth: { min: 0, max: 1, levels: [] },
      weed: { min: 0, max: 1, levels: [] },
      fishRate: { min: 0, max: 1, levels: [] },
      temperature: { min: 0, max: 1, levels: [] },
    },
    bounds: null,
    tempStats: null,
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
  // Clear localStorage so baseLayer-init tests don't bleed into one another.
  globalThis.localStorage?.clear();
  // Reset store between tests
  useDeeperMapsStore.setState({
    scans: {},
    activeScanId: null,
    layerBundle: null,
    progress: null,
    warnings: [],
    baseLayer: 'osm',
    frameRequestSeq: 0,
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
  it('hydrate fills missing layerVisibility.temperature with false', async () => {
    const legacyScan = {
      id: 'legacy-1',
      name: 'legacy',
      deviceType: 'quest' as const,
      contentHash: 'h',
      createdAt: 0,
      updatedAt: 0,
      fileMeta: [],
      thresholds: DEFAULT_THRESHOLDS,
      layerVisibility: {
        bathymetry: true,
        weed: true,
        fishDensity: true,
        sweetSpots: true,
      },
    } as unknown as StoredScan;
    await saveScan(legacyScan, []);

    await useDeeperMapsStore.getState().hydrate();
    const hydrated = useDeeperMapsStore.getState().scans['legacy-1'];
    expect(hydrated?.layerVisibility.temperature).toBe(false);
    expect(hydrated?.layerVisibility.bathymetry).toBe(true);
  });

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
    await saveScanResults({
      scanId: a.id,
      bundleVersion: CURRENT_BUNDLE_VERSION,
      builtAt: 0,
      bundle,
    });
    await useDeeperMapsStore.getState().hydrate();

    await useDeeperMapsStore.getState().setActiveScan(a.id);

    expect(useDeeperMapsStore.getState().layerBundle).toEqual(bundle);
    expect(getStubbedPostMessage()).not.toHaveBeenCalled();
  });

  it('setActiveScan ignores cache when bundleVersion is stale', async () => {
    const a = makeScan('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A', 'hashA');
    await saveScan(a, []);
    // Pre-populate scanResults with a deliberately stale bundleVersion. The
    // store must treat this as a cache miss and re-dispatch to the worker.
    const staleBundle = emptyBundle();
    await saveScanResults({
      scanId: a.id,
      bundleVersion: CURRENT_BUNDLE_VERSION - 1,
      builtAt: 0,
      bundle: staleBundle,
    });
    await useDeeperMapsStore.getState().hydrate();

    await useDeeperMapsStore.getState().setActiveScan(a.id);

    // Cache was ignored: layerBundle was NOT loaded from the stale entry.
    expect(useDeeperMapsStore.getState().layerBundle).toBeNull();
    // Worker was dispatched an analyse to recompute with current code.
    const post = getStubbedPostMessage();
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0]?.[0]).toMatchObject({ kind: 'analyse', scanId: a.id });
  });

  it('setActiveScan uses cache when bundleVersion matches CURRENT_BUNDLE_VERSION', async () => {
    const a = makeScan('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A', 'hashA');
    await saveScan(a, []);
    const bundle = emptyBundle();
    await saveScanResults({
      scanId: a.id,
      bundleVersion: CURRENT_BUNDLE_VERSION,
      builtAt: 0,
      bundle,
    });
    await useDeeperMapsStore.getState().hydrate();

    await useDeeperMapsStore.getState().setActiveScan(a.id);

    expect(useDeeperMapsStore.getState().layerBundle).toEqual(bundle);
    // No analyse dispatch — cache hit.
    expect(getStubbedPostMessage()).not.toHaveBeenCalled();
  });

  it('setActiveScan A then B with cached A does not land A bundle in B view', async () => {
    // Save scans A and B; cache results for A only.
    const a = makeScan('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A', 'hashA');
    const b = makeScan('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'B', 'hashB');
    await saveScan(a, []);
    await saveScan(b, []);
    await saveScanResults({
      scanId: a.id,
      bundleVersion: CURRENT_BUNDLE_VERSION,
      builtAt: 0,
      bundle: {
        bathymetry: { type: 'FeatureCollection', features: [] },
        weed: { type: 'FeatureCollection', features: [] },
        bathymetryLines: { type: 'FeatureCollection', features: [] },
        fishDensity: { type: 'FeatureCollection', features: [] },
        sweetSpots: { type: 'FeatureCollection', features: [] },
        temperature: { type: 'FeatureCollection', features: [] },
        scales: {
          depth: { min: 1, max: 2, levels: [] },
          weed: { min: 0, max: 1, levels: [] },
          fishRate: { min: 0, max: 1, levels: [] },
          temperature: { min: 0, max: 1, levels: [] },
        },
        bounds: null,
        tempStats: null,
      },
    });
    await useDeeperMapsStore.getState().hydrate();

    // Fire A and B concurrently; B "wins" (last call). The A cache load
    // resolves first but must NOT land in the bundle field.
    const promiseA = useDeeperMapsStore.getState().setActiveScan(a.id);
    const promiseB = useDeeperMapsStore.getState().setActiveScan(b.id);
    await Promise.all([promiseA, promiseB]);

    expect(useDeeperMapsStore.getState().activeScanId).toBe(b.id);
    expect(useDeeperMapsStore.getState().layerBundle).toBeNull();
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

  it('saveAndAnalyse clears any previous layerBundle and progress (so MapView can reframe on the new scan)', async () => {
    // Seed a stale bundle from a prior scan plus in-flight progress to mimic
    // a real user uploading a new scan while another is on-screen.
    useDeeperMapsStore.setState({
      layerBundle: emptyBundle(),
      progress: { stage: 'parse', processed: 0, total: 1 },
    });

    const a = makeScan('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A', 'hashA');
    const blob = new NodeBlob([new Uint8Array([1, 2, 3])]) as unknown as Blob;

    await useDeeperMapsStore.getState().saveAndAnalyse(a, [{ fileName: 'bathymetry.csv', blob }]);

    const s = useDeeperMapsStore.getState();
    expect(s.activeScanId).toBe(a.id);
    expect(s.layerBundle).toBeNull();
    expect(s.progress).toBeNull();
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

  it('hydrate fills a missing maxSweetSpots with the default', async () => {
    const legacy = makeScan('legacy-ss', 'legacy', 'hashSS');
    delete (legacy as { maxSweetSpots?: number }).maxSweetSpots;
    await saveScan(legacy, []);

    await useDeeperMapsStore.getState().hydrate();

    expect(useDeeperMapsStore.getState().scans['legacy-ss']?.maxSweetSpots).toBe(12);
  });

  it('setMaxSweetSpots persists and updates the store (rounded, floored at 1)', async () => {
    const a = makeScan('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A', 'hashA');
    await saveScan(a, []);
    await useDeeperMapsStore.getState().hydrate();

    await useDeeperMapsStore.getState().setMaxSweetSpots(a.id, 25);
    expect(useDeeperMapsStore.getState().scans[a.id]?.maxSweetSpots).toBe(25);

    // Rounds fractional slider values and never drops below 1.
    await useDeeperMapsStore.getState().setMaxSweetSpots(a.id, 0);
    expect(useDeeperMapsStore.getState().scans[a.id]?.maxSweetSpots).toBe(1);
  });

  it('setMaxSweetSpots is a no-op for an unknown scan id', async () => {
    await useDeeperMapsStore
      .getState()
      .setMaxSweetSpots('zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz', 20);
    expect(useDeeperMapsStore.getState().scans).toEqual({});
  });

  it('setBaseLayer updates the global store value and persists it to localStorage', () => {
    expect(useDeeperMapsStore.getState().baseLayer).toBe('osm');

    useDeeperMapsStore.getState().setBaseLayer('satellite');

    expect(useDeeperMapsStore.getState().baseLayer).toBe('satellite');
    expect(globalThis.localStorage?.getItem('deeper-maps:baseLayer')).toBe('satellite');
  });

  it('setBaseLayer does not throw when localStorage.setItem throws', () => {
    const setItemSpy = vi.spyOn(globalThis.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    try {
      expect(() => useDeeperMapsStore.getState().setBaseLayer('satellite')).not.toThrow();
      // Store still updates in-memory even though persistence failed.
      expect(useDeeperMapsStore.getState().baseLayer).toBe('satellite');
    } finally {
      setItemSpy.mockRestore();
    }
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
  const ACTIVE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

  it('routes a progress message into store.progress', () => {
    useDeeperMapsStore.setState({ activeScanId: ACTIVE_ID });
    deliverWorkerMessage({
      kind: 'progress',
      scanId: ACTIVE_ID,
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
    const bundle = emptyBundle();
    useDeeperMapsStore.setState({
      activeScanId: ACTIVE_ID,
      progress: { stage: 'buildLayers', processed: 1, total: 1 },
    });

    deliverWorkerMessage({
      kind: 'layerBundle',
      scanId: ACTIVE_ID,
      bundle,
      warnings: ['heads up'],
    });

    expect(useDeeperMapsStore.getState().layerBundle).toEqual(bundle);
    expect(useDeeperMapsStore.getState().progress).toBeNull();
    expect(useDeeperMapsStore.getState().warnings).toEqual(['heads up']);

    // saveScanResults runs as a fire-and-forget; give it a microtask to settle.
    await new Promise<void>((r) => setTimeout(r, 0));
    const cached = await loadScanResults(ACTIVE_ID);
    expect(cached?.bundle).toEqual(bundle);
  });

  it('saveScanResults stamps the current bundle version', async () => {
    const bundle = emptyBundle();
    useDeeperMapsStore.setState({ activeScanId: ACTIVE_ID });

    deliverWorkerMessage({
      kind: 'layerBundle',
      scanId: ACTIVE_ID,
      bundle,
      warnings: [],
    });

    // Fire-and-forget IDB write; let it settle.
    await new Promise<void>((r) => setTimeout(r, 0));
    const cached = await loadScanResults(ACTIVE_ID);
    expect(cached?.bundleVersion).toBe(CURRENT_BUNDLE_VERSION);
  });

  it('routes an error message: clears progress, surfaces the message in warnings', () => {
    useDeeperMapsStore.setState({
      activeScanId: ACTIVE_ID,
      progress: { stage: 'parse', processed: 1, total: 2 },
    });

    deliverWorkerMessage({
      kind: 'error',
      scanId: ACTIVE_ID,
      message: 'parse failed',
    });

    expect(useDeeperMapsStore.getState().progress).toBeNull();
    expect(useDeeperMapsStore.getState().warnings).toEqual(['parse failed']);
  });

  it('routes a cancelled message: clears progress, leaves bundle and warnings untouched', () => {
    const bundle = emptyBundle();
    useDeeperMapsStore.setState({
      activeScanId: ACTIVE_ID,
      progress: { stage: 'parse', processed: 1, total: 2 },
      layerBundle: bundle,
      warnings: ['existing'],
    });

    deliverWorkerMessage({
      kind: 'cancelled',
      scanId: ACTIVE_ID,
    });

    const s = useDeeperMapsStore.getState();
    expect(s.progress).toBeNull();
    expect(s.layerBundle).toBe(bundle);
    expect(s.warnings).toEqual(['existing']);
  });

  it('drops a stale layerBundle that arrives after the user switched scans', async () => {
    const aId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const bId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const activeBundle = emptyBundle();
    // Active scan is A; a stale layerBundle arrives for B (the worker was
    // working on B before the user navigated to A).
    useDeeperMapsStore.setState({
      activeScanId: aId,
      layerBundle: activeBundle,
      warnings: [],
    });

    const staleBundle: LayerBundle = {
      bathymetry: { type: 'FeatureCollection', features: [] },
      weed: { type: 'FeatureCollection', features: [] },
      bathymetryLines: { type: 'FeatureCollection', features: [] },
      fishDensity: { type: 'FeatureCollection', features: [] },
      sweetSpots: { type: 'FeatureCollection', features: [] },
      temperature: { type: 'FeatureCollection', features: [] },
      scales: {
        depth: { min: 99, max: 100, levels: [] },
        weed: { min: 0, max: 1, levels: [] },
        fishRate: { min: 0, max: 1, levels: [] },
        temperature: { min: 0, max: 1, levels: [] },
      },
      bounds: null,
      tempStats: null,
    };
    deliverWorkerMessage({
      kind: 'layerBundle',
      scanId: bId,
      bundle: staleBundle,
      warnings: ['stale'],
    });

    // Active scan's view is untouched.
    const s = useDeeperMapsStore.getState();
    expect(s.activeScanId).toBe(aId);
    expect(s.layerBundle).toBe(activeBundle);
    expect(s.warnings).toEqual([]);

    // BUT the stale bundle was still cached for B — the worker did the work,
    // we want the cache-hit when the user comes back.
    await new Promise<void>((r) => setTimeout(r, 0));
    const cached = await loadScanResults(bId);
    expect(cached?.bundle).toEqual(staleBundle);
  });

  it('surfaces a message when the worker fires an error event (e.g. OOM crash)', () => {
    useDeeperMapsStore.setState({
      activeScanId: ACTIVE_ID,
      progress: { stage: 'parse', processed: 0, total: 1 },
    });

    const onError = __getWorkerErrorListener();
    if (!onError) throw new Error('no error listener attached');
    onError();

    const s = useDeeperMapsStore.getState();
    expect(s.progress).toBeNull();
    expect(s.warnings.length).toBe(1);
    expect(s.warnings[0]).toMatch(/too large/i);
  });

  it('worker error event is a no-op when no scan is active', () => {
    useDeeperMapsStore.setState({ activeScanId: null, warnings: [] });
    const onError = __getWorkerErrorListener();
    if (!onError) throw new Error('no error listener attached');
    onError();
    expect(useDeeperMapsStore.getState().warnings).toEqual([]);
  });

  it('drops a stale progress message that arrives for a non-active scan', () => {
    const aId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const bId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    useDeeperMapsStore.setState({ activeScanId: aId, progress: null });

    deliverWorkerMessage({
      kind: 'progress',
      scanId: bId,
      stage: 'parse',
      processed: 3,
      total: 10,
    });

    expect(useDeeperMapsStore.getState().progress).toBeNull();
  });
});

describe('useDeeperMapsStore — cancellation on scan switch', () => {
  it("saveAndAnalyse cancels the previous scan's in-flight job", async () => {
    const a = makeScan('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A', 'hashA');
    const b = makeScan('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'B', 'hashB');
    useDeeperMapsStore.setState({ activeScanId: a.id });
    const post = getStubbedPostMessage();
    post.mockClear();

    const blob = new NodeBlob([new Uint8Array([1, 2, 3])]) as unknown as Blob;
    await useDeeperMapsStore.getState().saveAndAnalyse(b, [{ fileName: 'bathymetry.csv', blob }]);

    // First dispatch is the cancel for A; later we get the analyse for B.
    expect(post.mock.calls[0]?.[0]).toEqual({ kind: 'cancel', scanId: a.id });
    const analyseCalls = post.mock.calls.filter(
      (c) => (c[0] as { kind: string }).kind === 'analyse',
    );
    expect(analyseCalls).toHaveLength(1);
    expect(analyseCalls[0]?.[0]).toMatchObject({ kind: 'analyse', scanId: b.id });
    // Cancel happened before analyse.
    const cancelIdx = post.mock.calls.findIndex(
      (c) => (c[0] as { kind: string }).kind === 'cancel',
    );
    const analyseIdx = post.mock.calls.findIndex(
      (c) => (c[0] as { kind: string }).kind === 'analyse',
    );
    expect(cancelIdx).toBeLessThan(analyseIdx);
  });

  it("setActiveScan cancels the previous scan's in-flight job", async () => {
    const a = makeScan('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A', 'hashA');
    const b = makeScan('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'B', 'hashB');
    await saveScan(a, []);
    await saveScan(b, []);
    await useDeeperMapsStore.getState().hydrate();
    useDeeperMapsStore.setState({ activeScanId: a.id });
    const post = getStubbedPostMessage();
    post.mockClear();

    await useDeeperMapsStore.getState().setActiveScan(b.id);

    // First dispatch is the cancel for A.
    expect(post.mock.calls[0]?.[0]).toEqual({ kind: 'cancel', scanId: a.id });
  });

  it('saveAndAnalyse does NOT cancel when there is no previous active scan', async () => {
    const a = makeScan('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A', 'hashA');
    expect(useDeeperMapsStore.getState().activeScanId).toBeNull();
    const post = getStubbedPostMessage();
    post.mockClear();

    const blob = new NodeBlob([new Uint8Array([1, 2, 3])]) as unknown as Blob;
    await useDeeperMapsStore.getState().saveAndAnalyse(a, [{ fileName: 'bathymetry.csv', blob }]);

    const cancelCalls = post.mock.calls.filter((c) => (c[0] as { kind: string }).kind === 'cancel');
    expect(cancelCalls).toHaveLength(0);
  });

  it('setActiveScan does NOT cancel when re-selecting the same scan', async () => {
    const a = makeScan('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A', 'hashA');
    await saveScan(a, []);
    await useDeeperMapsStore.getState().hydrate();
    useDeeperMapsStore.setState({ activeScanId: a.id });
    const post = getStubbedPostMessage();
    post.mockClear();

    await useDeeperMapsStore.getState().setActiveScan(a.id);

    const cancelCalls = post.mock.calls.filter((c) => (c[0] as { kind: string }).kind === 'cancel');
    expect(cancelCalls).toHaveLength(0);
  });
});

describe('useDeeperMapsStore — frameRequestSeq', () => {
  it('setActiveScan increments frameRequestSeq even when re-selecting the same id', async () => {
    const a = makeScan('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A', 'hashA');
    await saveScan(a, []);
    await useDeeperMapsStore.getState().hydrate();

    expect(useDeeperMapsStore.getState().frameRequestSeq).toBe(0);

    await useDeeperMapsStore.getState().setActiveScan(a.id);
    const afterFirst = useDeeperMapsStore.getState().frameRequestSeq;
    expect(afterFirst).toBe(1);

    // Re-select the SAME scan: seq still increments so MapView reframes.
    await useDeeperMapsStore.getState().setActiveScan(a.id);
    expect(useDeeperMapsStore.getState().frameRequestSeq).toBe(2);
  });

  it('saveAndAnalyse increments frameRequestSeq', async () => {
    const a = makeScan('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A', 'hashA');
    expect(useDeeperMapsStore.getState().frameRequestSeq).toBe(0);

    const blob = new NodeBlob([new Uint8Array([1, 2, 3])]) as unknown as Blob;
    await useDeeperMapsStore.getState().saveAndAnalyse(a, [{ fileName: 'bathymetry.csv', blob }]);

    expect(useDeeperMapsStore.getState().frameRequestSeq).toBe(1);
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

describe('useDeeperMapsStore — baseLayer persistence', () => {
  // These tests must reload the store module so the create() initialiser runs
  // again and reads the pre-populated localStorage value. vi.resetModules() +
  // a dynamic import gives us a fresh module evaluation per test.
  beforeEach(() => {
    vi.resetModules();
    globalThis.localStorage?.clear();
  });

  it("initialises baseLayer from localStorage when set to 'satellite'", async () => {
    globalThis.localStorage?.setItem('deeper-maps:baseLayer', 'satellite');
    const mod = await import('../store');
    expect(mod.useDeeperMapsStore.getState().baseLayer).toBe('satellite');
  });

  it("defaults to 'osm' when localStorage has no value", async () => {
    const mod = await import('../store');
    expect(mod.useDeeperMapsStore.getState().baseLayer).toBe('osm');
  });

  it("ignores unrecognised localStorage values and defaults to 'osm'", async () => {
    globalThis.localStorage?.setItem('deeper-maps:baseLayer', 'something-bogus');
    const mod = await import('../store');
    expect(mod.useDeeperMapsStore.getState().baseLayer).toBe('osm');
  });

  it("falls back to 'osm' when localStorage.getItem throws", async () => {
    const getItemSpy = vi.spyOn(globalThis.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('access denied');
    });
    try {
      const mod = await import('../store');
      expect(mod.useDeeperMapsStore.getState().baseLayer).toBe('osm');
    } finally {
      getItemSpy.mockRestore();
    }
  });
});
