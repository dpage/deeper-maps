import { FormControlLabel, FormGroup, Stack, Switch, Typography } from '@mui/material';
import { useDeeperMapsStore } from '../state/store';
import type { LayerVisibility, StoredScan } from '../storage/types';

const LABELS: Record<keyof LayerVisibility, string> = {
  bathymetry: 'Bathymetry',
  weed: 'Weed',
  fishDensity: 'Fish density',
  sweetSpots: 'Sweet spots',
  temperature: 'Temperature',
};

export interface LayerControlsProps {
  scan: StoredScan;
}

export function LayerControls({ scan }: LayerControlsProps): JSX.Element {
  const setLayerVisibility = useDeeperMapsStore((s) => s.setLayerVisibility);
  return (
    <Stack spacing={1}>
      <Typography variant="subtitle2">Layers</Typography>
      <FormGroup>
        {(Object.keys(LABELS) as (keyof LayerVisibility)[]).map((key) => (
          <FormControlLabel
            key={key}
            control={
              <Switch
                checked={scan.layerVisibility[key]}
                onChange={(e) => void setLayerVisibility(scan.id, key, e.target.checked)}
                inputProps={{ 'aria-label': LABELS[key] }}
              />
            }
            label={LABELS[key]}
          />
        ))}
      </FormGroup>
    </Stack>
  );
}
