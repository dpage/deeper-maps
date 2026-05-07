import { CssBaseline, ThemeProvider } from '@mui/material';
import { useEffect, useState } from 'react';
import { MapView } from './map/MapView';
import { useDeeperMapsStore } from './state/store';
import { ActiveScanPanel } from './ui/ActiveScanPanel';
import { AppHeader } from './ui/AppHeader';
import { CompletionToast } from './ui/CompletionToast';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { Layout } from './ui/Layout';
import { Legend } from './ui/Legend';
import { ProgressBanner } from './ui/ProgressBanner';
import { ScanLibrary } from './ui/ScanLibrary';
import { theme } from './ui/theme';
import { UploadDialog } from './ui/UploadDialog';

export function App(): JSX.Element {
  const hydrate = useDeeperMapsStore((s) => s.hydrate);
  const baseLayer = useDeeperMapsStore((s) => s.baseLayer);
  const setBaseLayer = useDeeperMapsStore((s) => s.setBaseLayer);
  const [uploadOpen, setUploadOpen] = useState(false);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <ErrorBoundary>
        <Layout
          header={<AppHeader baseLayer={baseLayer} onBaseLayerChange={(b) => setBaseLayer(b)} />}
          drawer={
            <>
              <ScanLibrary onRequestUpload={() => setUploadOpen(true)} />
              <ActiveScanPanel />
            </>
          }
          main={
            <>
              <MapView />
              <Legend />
              <ProgressBanner />
            </>
          }
        />
        <UploadDialog open={uploadOpen} onClose={() => setUploadOpen(false)} />
        <CompletionToast />
      </ErrorBoundary>
    </ThemeProvider>
  );
}
