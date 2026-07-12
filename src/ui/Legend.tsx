import { Box, Paper, Stack, Typography } from '@mui/material';
import { greensRamp, plasmaRamp, viridisRamp, ylOrRdRamp } from '../map/colors';
import { useDeeperMapsStore } from '../state/store';

const SWEET_SPOTS = [
  { label: 'Gold', color: '#FFD700' },
  { label: 'Silver', color: '#7CB342' },
  { label: 'Bronze', color: '#1976D2' },
  { label: 'Weeded', color: '#FB8C00' },
];

function RampSwatch({ ramp }: { ramp: readonly (readonly [number, string])[] }): JSX.Element {
  const stops = ramp.map(([t, c]) => `${c} ${t * 100}%`).join(', ');
  return (
    <Box
      sx={{
        width: 80,
        height: 8,
        borderRadius: 0.5,
        background: `linear-gradient(to right, ${stops})`,
      }}
    />
  );
}

export function Legend(): JSX.Element | null {
  const layerBundle = useDeeperMapsStore((s) => s.layerBundle);
  const activeScanId = useDeeperMapsStore((s) => s.activeScanId);
  const scans = useDeeperMapsStore((s) => s.scans);
  const viewMode = useDeeperMapsStore((s) => s.viewMode);
  if (!layerBundle || !activeScanId) return null;
  const scan = scans[activeScanId];
  if (!scan) return null;

  // The 3D surface is depth-coloured only, so the other overlays' legends would
  // be misleading — show just the depth ramp.
  const is3d = viewMode === '3d';

  return (
    <Paper
      elevation={3}
      sx={{ position: 'absolute', bottom: 16, right: 16, p: 1.5, minWidth: 180 }}
    >
      <Stack spacing={0.75}>
        {(is3d || scan.layerVisibility.bathymetry) && (
          <Stack direction="row" spacing={1} alignItems="center">
            <RampSwatch ramp={viridisRamp} />
            <Typography variant="caption">
              Depth: {layerBundle.scales.depth.min.toFixed(1)}–
              {layerBundle.scales.depth.max.toFixed(1)} m
            </Typography>
          </Stack>
        )}
        {!is3d && scan.layerVisibility.weed && (
          <Stack direction="row" spacing={1} alignItems="center">
            <RampSwatch ramp={greensRamp} />
            <Typography variant="caption">
              Weed: {layerBundle.scales.weed.min.toFixed(2)}–
              {layerBundle.scales.weed.max.toFixed(2)} m
            </Typography>
          </Stack>
        )}
        {!is3d && scan.layerVisibility.fishDensity && (
          <Stack direction="row" spacing={1} alignItems="center">
            <RampSwatch ramp={ylOrRdRamp} />
            <Typography variant="caption">
              Fish rate: {(layerBundle.scales.fishRate.min * 100).toFixed(0)}–
              {(layerBundle.scales.fishRate.max * 100).toFixed(0)}%
            </Typography>
          </Stack>
        )}
        {!is3d && scan.layerVisibility.temperature && layerBundle.tempStats != null && (
          <Stack direction="row" spacing={1} alignItems="center">
            <RampSwatch ramp={plasmaRamp} />
            <Typography variant="caption">
              Temp: {layerBundle.scales.temperature.min.toFixed(1)}–
              {layerBundle.scales.temperature.max.toFixed(1)} °C
            </Typography>
          </Stack>
        )}
        {!is3d && scan.layerVisibility.sweetSpots && (
          <Stack spacing={0.25}>
            <Typography variant="caption">Sweet spots</Typography>
            <Stack direction="row" spacing={1}>
              {SWEET_SPOTS.map((s) => (
                <Stack key={s.label} direction="row" alignItems="center" spacing={0.25}>
                  <Box
                    sx={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      bgcolor: s.color,
                      border: '1px solid #fff',
                    }}
                  />
                  <Typography variant="caption">{s.label}</Typography>
                </Stack>
              ))}
            </Stack>
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}
