import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import { useDeeperMapsStore } from '../state/store';
import type { StoredScan } from '../storage/types';

export interface MergeDialogProps {
  scan: StoredScan;
  open: boolean;
  onClose: () => void;
}

/**
 * Upload a second Deeper export and fold its data into an existing scan — the
 * "re-visited the same lake" case. The combined scan replaces the original in
 * the library and is re-analysed on close.
 */
export function MergeDialog({ scan, open, onClose }: MergeDialogProps): JSX.Element {
  const mergeScan = useDeeperMapsStore((s) => s.mergeScan);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function reset(): void {
    setFile(null);
    setError(null);
    setBusy(false);
  }

  function handleClose(): void {
    reset();
    onClose();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const f = e.target.files?.[0];
    if (!f) return;
    setError(null);
    setFile(f);
  }

  async function handleMerge(): Promise<void> {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      await mergeScan(scan.id, { fileName: file.name, bytes });
      handleClose();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Merge into &ldquo;{scan.name}&rdquo;</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <DialogContentText>
            Add another scan of the same water — a Quest export (.zip) or a Deeper mobile export
            (.csv). Its data is combined with this scan and re-analysed as one, building a more
            complete map.
          </DialogContentText>
          <Button variant="outlined" component="label" disabled={busy}>
            Choose file
            <input
              type="file"
              hidden
              accept=".zip,.csv,application/zip,text/csv"
              aria-label="merge upload"
              onChange={handleFileChange}
            />
          </Button>
          {file && <Typography variant="body2">{file.name}</Typography>}
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={busy}>
          Cancel
        </Button>
        <Button variant="contained" onClick={() => void handleMerge()} disabled={!file || busy}>
          {busy ? 'Merging…' : 'Merge & analyse'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
