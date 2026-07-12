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
  const viewMode = useDeeperMapsStore((s) => s.viewMode);

  // `hasSonar === false` means the scan is depth/temperature-only; leave the
  // sonar layers switched off and disabled so it's clear they're unavailable.
  const noSonar = scan.hasSonar === false;
  // The 3D view renders the depth surface only, so none of these overlay
  // toggles apply there — disable them all while keeping the 2D config visible.
  const in3d = viewMode === '3d';

  const labels: Partial<Record<keyof LayerVisibility, string>> = { ...BASE_LABELS };
  if (tempStats != null) labels.temperature = 'Temperature';

  return (
    <Stack spacing={1}>
      <Typography variant="subtitle2">Layers</Typography>
      <FormGroup>
        {(Object.keys(labels) as (keyof LayerVisibility)[]).map((key) => {
          const noSonarLayer = noSonar && SONAR_LAYERS.has(key);
          const disabled = in3d || noSonarLayer;
          return (
            <FormControlLabel
              key={key}
              disabled={disabled}
              control={
                <Switch
                  checked={noSonarLayer ? false : scan.layerVisibility[key]}
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
      {in3d ? (
        <Typography variant="caption" color="text.secondary">
          Layer overlays apply to the 2D map view. The 3D model shows depth only.
        </Typography>
      ) : (
        noSonar && (
          <Typography variant="caption" color="text.secondary">
            Weed, fish density and sweet spots need sonar data, which this scan doesn&apos;t
            include.
          </Typography>
        )
      )}
    </Stack>
  );
}
