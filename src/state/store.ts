import { create } from 'zustand';
import {
  listScans as dbListScans,
  deleteScan as dbDeleteScan,
  loadScanRawFiles,
  loadScanResults,
  renameScan as dbRenameScan,
  saveScan,
  saveScanResults,
} from '../storage/scans';
import type { BaseLayerId, LayerVisibility, StoredScan } from '../storage/types';
import { CURRENT_BUNDLE_VERSION, type LayerBundle, type PipelineOptions } from '../analysis/types';
import type { PipelineStage, WorkerRequest, WorkerResponse } from '../worker/protocol';

const DEBOUNCE_MS = 200;

const BASE_LAYER_KEY = 'deeper-maps:baseLayer';

function loadBaseLayer(): BaseLayerId {
  try {
    const v = globalThis.localStorage?.getItem(BASE_LAYER_KEY);
    if (v === 'satellite' || v === 'osm') return v;
  } catch {
    // localStorage may throw in private mode or sandboxed contexts; ignore.
  }
  return 'osm';
}

function persistBaseLayer(base: BaseLayerId): void {
  try {
    globalThis.localStorage?.setItem(BASE_LAYER_KEY, base);
  } catch {
    // Ignore; UI state still updates in-memory.
  }
}

export interface DeeperMapsState {
  scans: Record<string, StoredScan>;
  activeScanId: string | null;
  layerBundle: LayerBundle | null;
  progress: { stage: PipelineStage; processed: number; total: number } | null;
  warnings: string[];
  /**
   * Global app-level base map preference. Persisted to localStorage under
   * `deeper-maps:baseLayer` so it survives reloads. Not per-scan — switching
   * scans should not change the user's preferred base map.
   */
  baseLayer: BaseLayerId;
  /**
   * Monotonic counter that increments every time the user explicitly requests a
   * scan be (re)framed — i.e. every `setActiveScan` and `saveAndAnalyse` call,
   * regardless of whether the active id actually changed. MapView observes this
   * and resets its `lastFramedScanIdRef` so the next layerBundle update fires
   * `fitBounds`. Without this, re-selecting the same active scan would not
   * snap the camera back (lastFramedScanIdRef already matches activeScanId).
   */
  frameRequestSeq: number;

  hydrate: () => Promise<void>;
  setActiveScan: (id: string | null) => Promise<void>;
  saveAndAnalyse: (scan: StoredScan, rawFiles: { fileName: string; blob: Blob }[]) => Promise<void>;
  updateThresholds: (scanId: string, thresholds: PipelineOptions) => void;
  setLayerVisibility: (
    scanId: string,
    layer: keyof LayerVisibility,
    visible: boolean,
  ) => Promise<void>;
  setBaseLayer: (base: BaseLayerId) => void;
  renameScan: (scanId: string, name: string) => Promise<void>;
  deleteScan: (scanId: string) => Promise<void>;
}

function getWorker(): Worker {
  const w = globalThis.__deeperMapsWorker;
  if (!w) {
    throw new Error(
      'Analyser worker not initialised — main.tsx must set globalThis.__deeperMapsWorker',
    );
  }
  return w;
}

function dispatchToWorker(msg: WorkerRequest): void {
  getWorker().postMessage(msg);
}

async function persistScan(scan: StoredScan): Promise<void> {
  await saveScan(scan, []);
}

// Module-scoped debounce timer. Reset between tests by `resetDebounceTimer`.
let recomputeTimer: ReturnType<typeof setTimeout> | null = null;

/** @internal — test-only. Clears the in-flight threshold-debounce timer. */
export function __resetDebounceTimer(): void {
  if (recomputeTimer) {
    clearTimeout(recomputeTimer);
    recomputeTimer = null;
  }
}

// Module-scoped reference to the message listener so tests can subscribe a
// fresh worker stub each beforeEach without leaking previous listeners.
let onMessageListener: ((e: MessageEvent<WorkerResponse>) => void) | null = null;

/**
 * (Re-)attaches the worker message listener to the worker currently on
 * `globalThis.__deeperMapsWorker`. Called once at module init via the
 * lazy `setTimeout` below; tests also call it directly to attach a freshly
 * stubbed worker in `beforeEach`.
 */
export function __attachWorkerListener(): void {
  if (!onMessageListener) return;
  try {
    getWorker().addEventListener('message', onMessageListener as EventListener);
  } catch {
    // Worker not available — caller must wire manually.
  }
}

export const useDeeperMapsStore = create<DeeperMapsState>((set, get) => {
  // Listen for worker responses; route them into the store.
  //
  // Every response is filtered by `m.scanId === get().activeScanId` so that a
  // late-arriving result from a scan the user has navigated away from cannot
  // pollute the active scan's UI state. (The cache write inside `layerBundle`
  // intentionally runs UNCONDITIONALLY: the worker did the work and the user
  // gets a fast cache-hit when they come back to that scan later.)
  onMessageListener = (e: MessageEvent<WorkerResponse>) => {
    const m = e.data;
    const isForActiveScan = m.scanId === get().activeScanId;

    if (m.kind === 'progress') {
      if (isForActiveScan) {
        set({ progress: { stage: m.stage, processed: m.processed, total: m.total } });
      }
      return;
    }

    if (m.kind === 'layerBundle') {
      // Cache the result regardless of whether the scan is still active —
      // the worker did the work; persist it so the user gets a fast cache-hit
      // when they navigate back.
      void saveScanResults({
        scanId: m.scanId,
        bundleVersion: CURRENT_BUNDLE_VERSION,
        builtAt: Date.now(),
        bundle: m.bundle,
      });
      if (isForActiveScan) {
        set({ layerBundle: m.bundle, progress: null, warnings: m.warnings });
      }
      return;
    }

    if (m.kind === 'error') {
      if (isForActiveScan) {
        set({ progress: null, warnings: [m.message] });
      }
      return;
    }

    if (m.kind === 'cancelled') {
      // Cancellation: clear progress but leave the previously-rendered bundle
      // and warnings untouched. The user explicitly invalidated the in-flight
      // computation (e.g. by tweaking a threshold mid-flight); they should not
      // see this surfaced as an error.
      if (isForActiveScan) {
        set({ progress: null });
      }
      return;
    }
  };
  // Subscribe lazily (worker may not be ready yet at module-eval time).
  setTimeout(() => {
    __attachWorkerListener();
  }, 0);

  return {
    scans: {},
    activeScanId: null,
    layerBundle: null,
    progress: null,
    warnings: [],
    baseLayer: loadBaseLayer(),
    frameRequestSeq: 0,

    async hydrate() {
      // TODO(spec §8.3): on `openDeeperMapsDb` failure (Safari private mode,
      // quota exceeded on open), fall back to in-memory + surface a persistent
      // banner. Plan 2 explicitly defers; the current behaviour is to throw,
      // which Plan 3's ErrorBoundary catches.
      const list = await dbListScans();
      const byId: Record<string, StoredScan> = {};
      for (const s of list) byId[s.id] = s;
      set({ scans: byId });
    },

    async setActiveScan(id) {
      // Cancel any in-flight worker job for the previous scan so we don't keep
      // chewing through irrelevant work AND we don't widen the window during
      // which a stale layerBundle might race in. The cancel is a no-op for
      // scans that have already finished.
      const prev = get().activeScanId;
      if (prev && prev !== id) {
        dispatchToWorker({ kind: 'cancel', scanId: prev });
      }
      set((s) => ({
        activeScanId: id,
        layerBundle: null,
        progress: null,
        frameRequestSeq: s.frameRequestSeq + 1,
      }));
      if (!id) return;
      const scan = get().scans[id];
      if (!scan) return;

      // Try the cache first.
      const cached = await loadScanResults(id);
      if (get().activeScanId !== id) return; // user navigated away during await
      if (cached && cached.bundleVersion === CURRENT_BUNDLE_VERSION) {
        set({ layerBundle: cached.bundle });
        return;
      }
      // Cache miss OR stale version — re-dispatch. (For stale, the worker
      // will produce a fresh bundle and saveScanResults will overwrite the
      // stale entry with bundleVersion=CURRENT_BUNDLE_VERSION.)
      const raws = await loadScanRawFiles(id);
      if (get().activeScanId !== id) return;
      const rawBytes = await Promise.all(
        raws.map(async (r) => ({
          fileName: r.fileName,
          bytes: new Uint8Array(await r.blob.arrayBuffer()),
        })),
      );
      if (get().activeScanId !== id) return; // also guard after the Promise.all
      dispatchToWorker({
        kind: 'analyse',
        scanId: id,
        rawFiles: rawBytes,
        options: scan.thresholds,
      });
    },

    async saveAndAnalyse(scan, rawFiles) {
      // Cancel the previous in-flight worker job so it doesn't race with the
      // new analyse for the new scan (and its eventual layerBundle would be
      // dropped at the store boundary anyway thanks to the message-listener
      // filter).
      const prev = get().activeScanId;
      if (prev && prev !== scan.id) {
        dispatchToWorker({ kind: 'cancel', scanId: prev });
      }
      await saveScan(scan, rawFiles);
      // Clear any previous bundle/progress when a new scan goes active. Without
      // this, MapView's layerBundle effect runs against the OLD bundle while
      // activeScanId already points at the new scan, fires fitBounds with the
      // wrong extents, and prematurely bumps `lastFramedScanIdRef` so the
      // real bundle's arrival no longer triggers a reframe.
      set((s) => ({
        scans: { ...s.scans, [scan.id]: scan },
        activeScanId: scan.id,
        layerBundle: null,
        progress: null,
        frameRequestSeq: s.frameRequestSeq + 1,
      }));
      const rawBytes = await Promise.all(
        rawFiles.map(async (r) => ({
          fileName: r.fileName,
          bytes: new Uint8Array(await r.blob.arrayBuffer()),
        })),
      );
      dispatchToWorker({
        kind: 'analyse',
        scanId: scan.id,
        rawFiles: rawBytes,
        options: scan.thresholds,
      });
    },

    updateThresholds(scanId, thresholds) {
      set((s) => {
        const scan = s.scans[scanId];
        if (!scan) return s;
        const updated: StoredScan = { ...scan, thresholds, updatedAt: Date.now() };
        return { scans: { ...s.scans, [scanId]: updated } };
      });

      if (recomputeTimer) clearTimeout(recomputeTimer);
      recomputeTimer = setTimeout(() => {
        recomputeTimer = null;
        const scan = get().scans[scanId];
        if (!scan) return;
        // TODO(spec §8.3): handle QuotaExceededError on this IDB write.
        void persistScan(scan);
        dispatchToWorker({ kind: 'recompute', scanId, options: thresholds });
      }, DEBOUNCE_MS);
    },

    async setLayerVisibility(scanId, layer, visible) {
      const scan = get().scans[scanId];
      if (!scan) return;
      const updated: StoredScan = {
        ...scan,
        layerVisibility: { ...scan.layerVisibility, [layer]: visible },
        updatedAt: Date.now(),
      };
      set((s) => ({ scans: { ...s.scans, [scanId]: updated } }));
      // TODO(spec §8.3): handle QuotaExceededError on this IDB write.
      await persistScan(updated);
    },

    setBaseLayer(base) {
      set({ baseLayer: base });
      persistBaseLayer(base);
    },

    async renameScan(scanId, name) {
      await dbRenameScan(scanId, name);
      set((s) => {
        const scan = s.scans[scanId];
        if (!scan) return s;
        const updated: StoredScan = { ...scan, name, updatedAt: Date.now() };
        return { scans: { ...s.scans, [scanId]: updated } };
      });
    },

    async deleteScan(scanId) {
      await dbDeleteScan(scanId);
      set((s) => {
        const next = { ...s.scans };
        delete next[scanId];
        return {
          scans: next,
          activeScanId: s.activeScanId === scanId ? null : s.activeScanId,
          layerBundle: s.activeScanId === scanId ? null : s.layerBundle,
        };
      });
    },
  };
});

/**
 * @internal — test-only. Returns the message listener that the store
 * registered on the worker. Tests can invoke it directly to simulate
 * worker → main-thread responses without spinning up a real Worker.
 */
export function __getWorkerMessageListener(): ((e: MessageEvent<WorkerResponse>) => void) | null {
  return onMessageListener;
}
