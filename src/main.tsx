import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import AnalyserWorker from './worker/analyser.worker?worker&inline';

// The single shared analyser worker. The developer harness (and Plan 3's UI)
// reach this via the Zustand store.
declare global {
  var __deeperMapsWorker: Worker | undefined;
}
globalThis.__deeperMapsWorker = new AnalyserWorker();

const container = document.getElementById('root');
if (!container) throw new Error('No #root element');
createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
