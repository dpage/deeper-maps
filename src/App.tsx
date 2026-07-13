import { CssBaseline, ThemeProvider } from '@mui/material';
import { useEffect, useState } from 'react';
import { MapView } from './map/MapView';
import { useDeeperMapsStore } from './state/store';
import { ActiveScanPanel } from './ui/ActiveScanPanel';
import { AppHeader } from './ui/AppHeader';
import { CompletionToast } from './ui/CompletionToast';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { Compass } from './ui/Compass';
import { LakeBed3DControls } from './ui/LakeBed3DControls';
import { Layout } from './ui/Layout';
import { OrbitCube } from './ui/OrbitCube';
import { Legend } from './ui/Legend';
import { ProgressBanner } from './ui/ProgressBanner';
import { ScanLibrary } from './ui/ScanLibrary';
import { theme } from './ui/theme';
import { UploadDialog } from './ui/UploadDialog';
import { WarningsAlert } from './ui/WarningsAlert';

export function App(): JSX.Element {
  const hydrate = useDeeperMapsStore((s) => s.hydrate);
  const baseLayer = useDeeperMapsStore((s) => s.baseLayer);
  const setBaseLayer = useDeeperMapsStore((s) => s.setBaseLayer);
  const viewMode = useDeeperMapsStore((s) => s.viewMode);
  const setViewMode = useDeeperMapsStore((s) => s.setViewMode);
  const [uploadOpen, setUploadOpen] = useState(false);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <ErrorBoundary>
        <Layout
          header={
            <AppHeader
              baseLayer={baseLayer}
              onBaseLayerChange={(b) => setBaseLayer(b)}
              viewMode={viewMode}
              onViewModeChange={(m) => setViewMode(m)}
            />
          }
          drawer={
            <>
              <ScanLibrary onRequestUpload={() => setUploadOpen(true)} />
              <ActiveScanPanel />
            </>
          }
          main={
            <>
              <MapView />
              <Compass />
              <OrbitCube />
              <Legend />
              <LakeBed3DControls />
              <ProgressBanner />
            </>
          }
        />
        <UploadDialog open={uploadOpen} onClose={() => setUploadOpen(false)} />
        <CompletionToast />
        <WarningsAlert />
      </ErrorBoundary>
    </ThemeProvider>
  );
}
