import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import ProbeWorker from './probe/probe.worker?worker&inline';

const probe = new ProbeWorker();
probe.onmessage = (e: MessageEvent<number>) => {
  console.info('[probe] worker round-trip ok, got:', e.data);
  probe.terminate();
};
probe.postMessage(21);

const container = document.getElementById('root');
if (!container) throw new Error('No #root element');
createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
