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
import type { LayerBundle, PipelineOptions } from '../analysis/types';
import type { PipelineStage, WorkerRequest, WorkerResponse } from '../worker/protocol';

const DEBOUNCE_MS = 200;

export interface DeeperMapsState {
  scans: Record<string, StoredScan>;
  activeScanId: string | null;
  layerBundle: LayerBundle | null;
  progress: { stage: PipelineStage; processed: number; total: number } | null;
  warnings: string[];

  hydrate: () => Promise<void>;
  setActiveScan: (id: string | null) => Promise<void>;
  saveAndAnalyse: (scan: StoredScan, rawFiles: { fileName: string; blob: Blob }[]) => Promise<void>;
  updateThresholds: (scanId: string, thresholds: PipelineOptions) => void;
  setLayerVisibility: (
    scanId: string,
    layer: keyof LayerVisibility,
    visible: boolean,
  ) => Promise<void>;
  setBaseLayer: (scanId: string, base: BaseLayerId) => Promise<void>;
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
 * @internal — test-only. (Re-)attaches the worker message listener to the
 * worker currently on `globalThis.__deeperMapsWorker`. Production code does
 * not call this; the listener is attached lazily via `setTimeout` below.
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
  onMessageListener = (e: MessageEvent<WorkerResponse>) => {
    const m = e.data;
    if (m.kind === 'progress') {
      set({ progress: { stage: m.stage, processed: m.processed, total: m.total } });
    } else if (m.kind === 'layerBundle') {
      set({ layerBundle: m.bundle, progress: null, warnings: m.warnings });
      void saveScanResults({
        scanId: m.scanId,
        bundleVersion: 1,
        builtAt: Date.now(),
        bundle: m.bundle,
      });
    } else if (m.kind === 'error') {
      set({ progress: null, warnings: [m.message] });
    } else if (m.kind === 'cancelled') {
      // Cancellation: clear progress but leave the previously-rendered bundle
      // and warnings untouched. The user explicitly invalidated the in-flight
      // computation (e.g. by tweaking a threshold mid-flight); they should not
      // see this surfaced as an error.
      set({ progress: null });
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

    async hydrate() {
      const list = await dbListScans();
      const byId: Record<string, StoredScan> = {};
      for (const s of list) byId[s.id] = s;
      set({ scans: byId });
    },

    async setActiveScan(id) {
      set({ activeScanId: id, layerBundle: null, progress: null });
      if (!id) return;
      const scan = get().scans[id];
      if (!scan) return;

      // Try the cache first.
      const cached = await loadScanResults(id);
      if (cached) {
        set({ layerBundle: cached.bundle });
        return;
      }

      // No cache — re-dispatch.
      const raws = await loadScanRawFiles(id);
      const rawBytes = await Promise.all(
        raws.map(async (r) => ({
          fileName: r.fileName,
          bytes: new Uint8Array(await r.blob.arrayBuffer()),
        })),
      );
      dispatchToWorker({
        kind: 'analyse',
        scanId: id,
        rawFiles: rawBytes,
        options: scan.thresholds,
      });
    },

    async saveAndAnalyse(scan, rawFiles) {
      await saveScan(scan, rawFiles);
      set((s) => ({ scans: { ...s.scans, [scan.id]: scan }, activeScanId: scan.id }));
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
      await persistScan(updated);
    },

    async setBaseLayer(scanId, base) {
      const scan = get().scans[scanId];
      if (!scan) return;
      const updated: StoredScan = { ...scan, baseLayer: base, updatedAt: Date.now() };
      set((s) => ({ scans: { ...s.scans, [scanId]: updated } }));
      await persistScan(updated);
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
