import { FormControlLabel, FormGroup, Stack, Switch, Typography } from '@mui/material';
import { useDeeperMapsStore } from '../state/store';
import type { LayerVisibility, StoredScan } from '../storage/types';

const BASE_LABELS: Partial<Record<keyof LayerVisibility, string>> = {
  bathymetry: 'Bathymetry',
  weed: 'Weed',
  fishDensity: 'Fish density',
  sweetSpots: 'Sweet spots',
};

export interface LayerControlsProps {
  scan: StoredScan;
}

export function LayerControls({ scan }: LayerControlsProps): JSX.Element {
  const setLayerVisibility = useDeeperMapsStore((s) => s.setLayerVisibility);
  const tempStats = useDeeperMapsStore((s) => s.layerBundle?.tempStats);

  const labels: Partial<Record<keyof LayerVisibility, string>> = { ...BASE_LABELS };
  if (tempStats != null) labels.temperature = 'Temperature';

  return (
    <Stack spacing={1}>
      <Typography variant="subtitle2">Layers</Typography>
      <FormGroup>
        {(Object.keys(labels) as (keyof LayerVisibility)[]).map((key) => (
          <FormControlLabel
            key={key}
            control={
              <Switch
                checked={scan.layerVisibility[key]}
                onChange={(e) => void setLayerVisibility(scan.id, key, e.target.checked)}
                inputProps={{ 'aria-label': labels[key] }}
              />
            }
            label={labels[key]}
          />
        ))}
      </FormGroup>
    </Stack>
  );
}
