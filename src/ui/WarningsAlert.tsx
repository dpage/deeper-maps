import { Alert, Snackbar } from '@mui/material';
import { useState } from 'react';
import { useDeeperMapsStore } from '../state/store';

/**
 * Surfaces store `warnings` to the user.
 *
 * Until this existed, `warnings` was written to the store (parse warnings,
 * hard analysis errors from the worker, and worker-crash/watchdog messages)
 * but never rendered anywhere — so a failed analysis looked like a silent
 * no-op: the progress banner vanished and nothing appeared on the map, with
 * no explanation. That is exactly the "no error messages, just nothing"
 * failure mode reported for large scans.
 *
 * Severity is inferred from whether a layer bundle is present: warnings shown
 * alongside a rendered bundle are advisory (skipped malformed rows, missing
 * sonar); warnings with no bundle mean the analysis produced nothing to show,
 * i.e. a genuine failure.
 *
 * The alert is keyed by its message text and stays up until dismissed (no
 * auto-hide) so an error can't be missed on a phone; a fresh set of warnings
 * re-opens it.
 */
export function WarningsAlert(): JSX.Element | null {
  const warnings = useDeeperMapsStore((s) => s.warnings);
  const layerBundle = useDeeperMapsStore((s) => s.layerBundle);
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);

  const key = warnings.join('\n');
  const open = warnings.length > 0 && key !== dismissedKey;
  const severity = layerBundle ? 'warning' : 'error';

  // Don't dismiss on click-away (e.g. panning the map) — only on an explicit
  // close (button / Escape) so an error stays readable on a phone.
  const handleClose = (_event: unknown, reason?: string): void => {
    if (reason === 'clickaway') return;
    setDismissedKey(key);
  };

  return (
    <Snackbar
      open={open}
      onClose={handleClose}
      anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      sx={{ mt: 8, maxWidth: 480 }}
    >
      <Alert severity={severity} onClose={handleClose} sx={{ whiteSpace: 'pre-line' }}>
        {key}
      </Alert>
    </Snackbar>
  );
}
