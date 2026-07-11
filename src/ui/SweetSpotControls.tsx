import { Slider, Stack, Typography } from '@mui/material';
import { useDeeperMapsStore } from '../state/store';
import { DEFAULT_MAX_SWEET_SPOTS, type StoredScan } from '../storage/types';

const MIN_SPOTS = 1;
const MAX_SPOTS = 50;

export interface SweetSpotControlsProps {
  scan: StoredScan;
}

/**
 * Slider for the per-scan cap on how many sweet-spot markers the map shows at
 * once. On a busy lake hundreds of cells qualify; the map renders only the best
 * of them within the current viewport, so this keeps the markers readable.
 */
export function SweetSpotControls({ scan }: SweetSpotControlsProps): JSX.Element {
  const setMaxSweetSpots = useDeeperMapsStore((s) => s.setMaxSweetSpots);
  const value = scan.maxSweetSpots ?? DEFAULT_MAX_SWEET_SPOTS;

  return (
    <Stack spacing={0.5}>
      <Typography variant="subtitle2">Sweet spots</Typography>
      <Typography variant="caption">{`Max shown: ${value}`}</Typography>
      <Slider
        value={value}
        min={MIN_SPOTS}
        max={MAX_SPOTS}
        step={1}
        size="small"
        aria-label="Max sweet spots shown"
        // Single-thumb slider: MapLibre always reports a plain number here.
        onChange={(_, v) => void setMaxSweetSpots(scan.id, v as number)}
      />
      <Typography variant="caption" color="text.secondary">
        Shows the best spots in view.
      </Typography>
    </Stack>
  );
}
