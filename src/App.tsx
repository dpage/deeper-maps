import { useEffect, useState } from 'react';
import { MapView } from './map/MapView';
import { useDeeperMapsStore } from './state/store';
import { scanContentHash } from './lib/hash';
import {
  DEFAULT_CATEGORY_THRESHOLDS,
  DEFAULT_CELL_OPTIONS,
  DEFAULT_COLOR_SCALE_OPTIONS,
  DEFAULT_LIFTOUT_OPTIONS,
  DEFAULT_SONAR_OPTIONS,
} from './analysis/constants';
import type { StoredScan } from './storage/types';

function uuid(): string {
  return crypto.randomUUID();
}

export function App(): JSX.Element {
  const hydrate = useDeeperMapsStore((s) => s.hydrate);
  const saveAndAnalyse = useDeeperMapsStore((s) => s.saveAndAnalyse);
  const progress = useDeeperMapsStore((s) => s.progress);
  const warnings = useDeeperMapsStore((s) => s.warnings);
  const activeScanId = useDeeperMapsStore((s) => s.activeScanId);
  const layerBundle = useDeeperMapsStore((s) => s.layerBundle);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  async function handleFile(file: File): Promise<void> {
    setBusy(true);
    try {
      const blob = file;
      const buf = new Uint8Array(await blob.arrayBuffer());
      const hash = await scanContentHash([{ fileName: file.name, bytes: buf }]);
      const scan: StoredScan = {
        id: uuid(),
        name: file.name,
        deviceType: 'quest',
        contentHash: hash,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        fileMeta: [{ name: file.name, byteSize: file.size, sha256: hash }],
        thresholds: {
          liftout: DEFAULT_LIFTOUT_OPTIONS,
          sonar: DEFAULT_SONAR_OPTIONS,
          cell: DEFAULT_CELL_OPTIONS,
          category: DEFAULT_CATEGORY_THRESHOLDS,
          colorScale: DEFAULT_COLOR_SCALE_OPTIONS,
        },
        layerVisibility: {
          bathymetry: true,
          weed: true,
          fishDensity: true,
          sweetSpots: true,
        },
        baseLayer: 'osm',
      };
      await saveAndAnalyse(scan, [{ fileName: file.name, blob }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'sans-serif',
      }}
    >
      <header
        style={{
          padding: '0.5rem 1rem',
          borderBottom: '1px solid #ddd',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          background: '#fafafa',
        }}
      >
        <h1 style={{ margin: 0, fontSize: '1.1rem' }}>Deeper Maps — developer harness</h1>
        <input
          type="file"
          accept=".zip,application/zip"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
          }}
        />
        {progress && (
          <span style={{ fontSize: '0.85rem' }}>
            {progress.stage} ({progress.processed}/{progress.total})
          </span>
        )}
        {activeScanId && layerBundle && (
          <span style={{ fontSize: '0.85rem', color: '#070' }}>✓ analysis ready</span>
        )}
        {warnings.length > 0 && (
          <span style={{ fontSize: '0.85rem', color: '#c44' }}>{warnings.join('; ')}</span>
        )}
      </header>
      <main style={{ flex: 1, position: 'relative' }}>
        <MapView />
      </main>
    </div>
  );
}
