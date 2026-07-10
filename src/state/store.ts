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

/**
 * How long the store waits for ANY message (progress or result) from the
 * worker after dispatching an analyse/recompute before assuming the worker
 * has died. iOS Safari silently terminates a Web Worker that exceeds the
 * per-tab memory ceiling — no `error` event, no result — which is exactly how
 * a too-large scan "processes then shows nothing". A healthy run keeps the
 * watchdog reset because the worker emits a `progress` message between every
 * pipeline stage; only a genuine stall (or OS kill) lets it fire.
 */
const WORKER_SILENCE_TIMEOUT_MS = 60_000;

const WORKER_FAILED_MESSAGE =
  'Processing stopped unexpectedly. This scan may be too large to open on this device — ' +
  'large scans can exhaust memory on tablets and phones. Try opening it in a desktop browser.';

const LAYER_VISIBILITY_DEFAULTS: LayerVisibility = {
  bathymetry: true,
  weed: true,
  fishDensity: true,
  sweetSpots: true,
  temperature: false,
};

function normaliseLayerVisibility(v: Partial<LayerVisibility> | undefined): LayerVisibility {
  return { ...LAYER_VISIBILITY_DEFAULTS, ...(v ?? {}) };
}

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

function dispatchToWorker(msg: WorkerRequest, transfer?: Transferable[]): void {
  // Transfer (rather than structured-clone) the raw file buffers when supplied:
  // a 70 MB Uint8Array would otherwise be COPIED across the worker boundary,
  // doubling peak memory at exactly the moment we can least afford it. Transfer
  // is safe because the buffers are freshly minted from the stored blob and the
  // main thread never touches them again after dispatch.
  if (transfer && transfer.length > 0) {
    getWorker().postMessage(msg, transfer);
  } else {
    getWorker().postMessage(msg);
  }
}

// Watchdog: detects a worker that goes silent after a dispatch (see
// WORKER_SILENCE_TIMEOUT_MS). Module-scoped so it survives across the
// store's action calls and can be reset by the message listener.
let watchdogTimer: ReturnType<typeof setTimeout> | null = null;
let watchdogScanId: string | null = null;

function clearWatchdog(): void {
  if (watchdogTimer) {
    clearTimeout(watchdogTimer);
    watchdogTimer = null;
  }
  watchdogScanId = null;
}

async function persistScan(scan: StoredScan): Promise<void> {
  await saveScan(scan, []);
}

// Module-scoped debounce timer. Reset between tests by `resetDebounceTimer`.
let recomputeTimer: ReturnType<typeof setTimeout> | null = null;

/** @internal — test-only. Clears the in-flight threshold-debounce and watchdog timers. */
export function __resetDebounceTimer(): void {
  if (recomputeTimer) {
    clearTimeout(recomputeTimer);
    recomputeTimer = null;
  }
  clearWatchdog();
}

// Module-scoped reference to the message listener so tests can subscribe a
// fresh worker stub each beforeEach without leaking previous listeners.
let onMessageListener: ((e: MessageEvent<WorkerResponse>) => void) | null = null;
// Module-scoped reference to the worker `error`/`messageerror` listener. Fires
// when the worker throws uncaught or dies in a way the browser DOES surface
// (some iOS OOM kills fire this, some fire nothing — hence the watchdog too).
let onWorkerErrorListener: (() => void) | null = null;

/**
 * (Re-)attaches the worker message listener to the worker currently on
 * `globalThis.__deeperMapsWorker`. Called once at module init via the
 * lazy `setTimeout` below; tests also call it directly to attach a freshly
 * stubbed worker in `beforeEach`.
 */
export function __attachWorkerListener(): void {
  if (!onMessageListener) return;
  try {
    const w = getWorker();
    w.addEventListener('message', onMessageListener as EventListener);
    if (onWorkerErrorListener) {
      w.addEventListener('error', onWorkerErrorListener as EventListener);
      w.addEventListener('messageerror', onWorkerErrorListener as EventListener);
    }
  } catch {
    // Worker not available — caller must wire manually.
  }
}

export const useDeeperMapsStore = create<DeeperMapsState>((set, get) => {
  // Arm the watchdog for a freshly-dispatched analyse/recompute. Reset on
  // every worker message for the scan (see the listener below); if it fires,
  // the worker went silent — most likely killed by the OS for running the
  // device out of memory on an oversized scan.
  const armWatchdog = (scanId: string): void => {
    clearWatchdog();
    watchdogScanId = scanId;
    watchdogTimer = setTimeout(() => {
      watchdogTimer = null;
      const stalledId = watchdogScanId;
      watchdogScanId = null;
      // Only surface if the stalled scan is still on screen and we never
      // rendered a result for it (a recompute over an already-visible bundle
      // leaves the old data up rather than raising a false alarm).
      if (stalledId && get().activeScanId === stalledId && get().layerBundle === null) {
        set({ progress: null, warnings: [WORKER_FAILED_MESSAGE] });
      }
    }, WORKER_SILENCE_TIMEOUT_MS);
    // Don't let a pending watchdog keep a Node test process alive; no-op in the browser.
    (watchdogTimer as { unref?: () => void }).unref?.();
  };

  // A worker `error`/`messageerror`: surface it against the active scan so the
  // user sees *something* instead of a silent dead-end, and stop the watchdog.
  onWorkerErrorListener = () => {
    clearWatchdog();
    if (get().activeScanId) {
      set({ progress: null, warnings: [WORKER_FAILED_MESSAGE] });
    }
  };

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

    // Any message for the watched scan proves the worker is alive: reset the
    // watchdog on progress, cancel it outright on a terminal message.
    if (m.scanId === watchdogScanId) {
      if (m.kind === 'progress') {
        armWatchdog(m.scanId);
      } else {
        clearWatchdog();
      }
    }

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
      for (const s of list) {
        byId[s.id] = { ...s, layerVisibility: normaliseLayerVisibility(s.layerVisibility) };
      }
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
      dispatchToWorker(
        {
          kind: 'analyse',
          scanId: id,
          rawFiles: rawBytes,
          options: scan.thresholds,
        },
        rawBytes.map((r) => r.bytes.buffer),
      );
      armWatchdog(id);
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
      dispatchToWorker(
        {
          kind: 'analyse',
          scanId: scan.id,
          rawFiles: rawBytes,
          options: scan.thresholds,
        },
        rawBytes.map((r) => r.bytes.buffer),
      );
      armWatchdog(scan.id);
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
        armWatchdog(scanId);
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

/**
 * @internal — test-only. Returns the worker `error`/`messageerror` listener the
 * store registered, so tests can simulate a worker crash without a real Worker.
 */
export function __getWorkerErrorListener(): (() => void) | null {
  return onWorkerErrorListener;
}
