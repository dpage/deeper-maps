import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { Alert, Snackbar } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { useDeeperMapsStore } from '../state/store';

const AUTO_HIDE_DURATION_MS = 2500;

/**
 * Brief "Analysis complete" toast. Fires when the worker successfully finishes
 * a run — i.e. progress transitions from non-null to null AND a fresh
 * `layerBundle` reference just landed. This wording is wrong on cancel/error
 * paths (both clear progress without producing a new bundle), so we gate on
 * the bundle reference changing too.
 */
export function CompletionToast(): JSX.Element {
  const progress = useDeeperMapsStore((s) => s.progress);
  const layerBundle = useDeeperMapsStore((s) => s.layerBundle);
  const prevProgressRef = useRef(progress);
  const prevLayerBundleRef = useRef(layerBundle);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const prevProgress = prevProgressRef.current;
    const prevBundle = prevLayerBundleRef.current;
    // Only fire on successful completion: previous tick had work happening,
    // current tick has no progress, AND a brand-new bundle reference has
    // landed. Cancellation and error paths leave layerBundle untouched, so
    // they don't pass this gate.
    if (prevProgress && !progress && layerBundle && layerBundle !== prevBundle) {
      setOpen(true);
    }
    prevProgressRef.current = progress;
    prevLayerBundleRef.current = layerBundle;
  }, [progress, layerBundle]);

  return (
    <Snackbar
      open={open}
      autoHideDuration={AUTO_HIDE_DURATION_MS}
      onClose={() => setOpen(false)}
      anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      sx={{ mt: 8 }}
    >
      <Alert
        severity="success"
        icon={<CheckCircleIcon fontSize="inherit" />}
        onClose={() => setOpen(false)}
      >
        Analysis complete
      </Alert>
    </Snackbar>
  );
}
