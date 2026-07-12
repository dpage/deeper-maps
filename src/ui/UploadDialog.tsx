import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import {
  DEFAULT_CATEGORY_THRESHOLDS,
  DEFAULT_CELL_OPTIONS,
  DEFAULT_COLOR_SCALE_OPTIONS,
  DEFAULT_LIFTOUT_OPTIONS,
  DEFAULT_SONAR_OPTIONS,
} from '../analysis/constants';
import { scanContentHash } from '../lib/hash';
import { useDeeperMapsStore } from '../state/store';
import { findScanByContentHash } from '../storage/scans';
import { DEFAULT_MAX_SWEET_SPOTS, type StoredScan } from '../storage/types';

const DEFAULT_THRESHOLDS = {
  liftout: DEFAULT_LIFTOUT_OPTIONS,
  sonar: DEFAULT_SONAR_OPTIONS,
  cell: DEFAULT_CELL_OPTIONS,
  category: DEFAULT_CATEGORY_THRESHOLDS,
  colorScale: DEFAULT_COLOR_SCALE_OPTIONS,
};

export interface UploadDialogProps {
  open: boolean;
  onClose: () => void;
}

export function UploadDialog({ open, onClose }: UploadDialogProps): JSX.Element {
  const saveAndAnalyse = useDeeperMapsStore((s) => s.saveAndAnalyse);
  const setActiveScan = useDeeperMapsStore((s) => s.setActiveScan);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [duplicateOf, setDuplicateOf] = useState<StoredScan | null>(null);

  function reset(): void {
    setFile(null);
    setError(null);
    setBusy(false);
    setDuplicateOf(null);
  }

  function handleClose(): void {
    reset();
    onClose();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const f = e.target.files?.[0];
    if (!f) return;
    setError(null);
    setDuplicateOf(null);
    setFile(f);

    try {
      const buf = new Uint8Array(await f.arrayBuffer());
      const hash = await scanContentHash([{ fileName: f.name, bytes: buf }]);
      const existing = await findScanByContentHash(hash);
      if (existing) setDuplicateOf(existing);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleSave(): Promise<void> {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      const hash = await scanContentHash([{ fileName: file.name, bytes: buf }]);
      const scan: StoredScan = {
        id: crypto.randomUUID(),
        name: file.name.replace(/\.(zip|csv)$/i, ''),
        deviceType: 'quest',
        contentHash: hash,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        fileMeta: [{ name: file.name, byteSize: file.size, sha256: hash }],
        thresholds: DEFAULT_THRESHOLDS,
        layerVisibility: {
          bathymetry: true,
          weed: true,
          fishDensity: true,
          sweetSpots: true,
          temperature: false,
        },
        maxSweetSpots: DEFAULT_MAX_SWEET_SPOTS,
      };
      await saveAndAnalyse(scan, [{ fileName: file.name, blob: file }]);
      handleClose();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Upload scan</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            A Quest export (.zip) for the full analysis, or a Deeper mobile export (.csv) for a
            depth &amp; temperature map.
          </Typography>
          <Button variant="outlined" component="label" disabled={busy}>
            Choose file
            <input
              type="file"
              hidden
              accept=".zip,.csv,application/zip,text/csv"
              aria-label="upload"
              onChange={(e) => void handleFileChange(e)}
            />
          </Button>
          {file && <Typography variant="body2">{file.name}</Typography>}
          {duplicateOf && (
            <Alert severity="info">
              A scan with identical contents is already in your library as &ldquo;{duplicateOf.name}
              &rdquo;.
              <Button
                size="small"
                onClick={() => {
                  void setActiveScan(duplicateOf.id);
                  handleClose();
                }}
                sx={{ ml: 1 }}
              >
                Open existing
              </Button>
            </Alert>
          )}
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={busy}>
          Cancel
        </Button>
        <Button variant="contained" onClick={() => void handleSave()} disabled={!file || busy}>
          {busy ? 'Saving…' : duplicateOf ? 'Save as duplicate' : 'Save & analyse'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
