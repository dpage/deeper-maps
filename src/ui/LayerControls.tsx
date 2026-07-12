import { FormControlLabel, FormGroup, Stack, Switch, Typography } from '@mui/material';
import { useDeeperMapsStore } from '../state/store';
import type { LayerVisibility, StoredScan } from '../storage/types';

const BASE_LABELS: Partial<Record<keyof LayerVisibility, string>> = {
  bathymetry: 'Bathymetry',
  weed: 'Weed',
  fishDensity: 'Fish density',
  sweetSpots: 'Sweet spots',
};

// Layers derived from sonar returns; unavailable on depth/temperature-only
// (e.g. Deeper mobile) scans.
const SONAR_LAYERS: ReadonlySet<keyof LayerVisibility> = new Set([
  'weed',
  'fishDensity',
  'sweetSpots',
]);

export interface LayerControlsProps {
  scan: StoredScan;
}

export function LayerControls({ scan }: LayerControlsProps): JSX.Element {
  const setLayerVisibility = useDeeperMapsStore((s) => s.setLayerVisibility);
  const tempStats = useDeeperMapsStore((s) => s.layerBundle?.tempStats);

  // `hasSonar === false` means the scan is depth/temperature-only; leave the
  // sonar layers switched off and disabled so it's clear they're unavailable.
  const noSonar = scan.hasSonar === false;

  const labels: Partial<Record<keyof LayerVisibility, string>> = { ...BASE_LABELS };
  if (tempStats != null) labels.temperature = 'Temperature';

  return (
    <Stack spacing={1}>
      <Typography variant="subtitle2">Layers</Typography>
      <FormGroup>
        {(Object.keys(labels) as (keyof LayerVisibility)[]).map((key) => {
          const disabled = noSonar && SONAR_LAYERS.has(key);
          return (
            <FormControlLabel
              key={key}
              disabled={disabled}
              control={
                <Switch
                  checked={disabled ? false : scan.layerVisibility[key]}
                  disabled={disabled}
                  onChange={(e) => void setLayerVisibility(scan.id, key, e.target.checked)}
                  inputProps={{ 'aria-label': labels[key] }}
                />
              }
              label={labels[key]}
            />
          );
        })}
      </FormGroup>
      {noSonar && (
        <Typography variant="caption" color="text.secondary">
          Weed, fish density and sweet spots need sonar data, which this scan doesn&apos;t include.
        </Typography>
      )}
    </Stack>
  );
}
