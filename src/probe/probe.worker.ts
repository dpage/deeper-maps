// Probe: a no-op worker used only to verify that ?worker&inline survives
// the vite-plugin-singlefile build. Delete this file once a real worker
// exists in src/worker/ (Plan 2).
self.onmessage = (e: MessageEvent<number>) => {
  (self as unknown as Worker).postMessage(e.data * 2);
};
export {};
