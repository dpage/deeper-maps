import { Box, Paper, Slider, Stack, Typography } from '@mui/material';
import {
  MAX_VERTICAL_EXAGGERATION,
  MIN_VERTICAL_EXAGGERATION,
  useDeeperMapsStore,
} from '../state/store';

/**
 * Overlay control shown only in 3D view: a vertical-exaggeration slider plus a
 * one-line hint on how to fly the camera. Lakes are near-flat in true scale, so
 * exaggeration is the difference between a legible relief map and a puddle.
 * Hidden entirely in 2D, or when there is no scan / no depth grid to show.
 */
export function LakeBed3DControls(): JSX.Element | null {
  const viewMode = useDeeperMapsStore((s) => s.viewMode);
  const exaggeration = useDeeperMapsStore((s) => s.verticalExaggeration);
  const setExaggeration = useDeeperMapsStore((s) => s.setVerticalExaggeration);
  const layerBundle = useDeeperMapsStore((s) => s.layerBundle);

  if (viewMode !== '3d') return null;
  if (!layerBundle?.depthGrid) return null;

  return (
    <Paper elevation={3} sx={{ position: 'absolute', top: 16, right: 16, p: 1.5, width: 220 }}>
      <Stack spacing={0.5}>
        <Typography variant="caption" sx={{ fontWeight: 600 }}>
          Vertical exaggeration ×{exaggeration}
        </Typography>
        <Box sx={{ px: 0.5 }}>
          <Slider
            size="small"
            value={exaggeration}
            min={MIN_VERTICAL_EXAGGERATION}
            max={MAX_VERTICAL_EXAGGERATION}
            step={1}
            marks={[
              { value: MIN_VERTICAL_EXAGGERATION, label: '1×' },
              { value: MAX_VERTICAL_EXAGGERATION, label: `${MAX_VERTICAL_EXAGGERATION}×` },
            ]}
            valueLabelDisplay="auto"
            onChange={(_e, v) => setExaggeration(Array.isArray(v) ? v[0]! : v)}
            aria-label="Vertical exaggeration"
          />
        </Box>
        <Typography variant="caption" color="text.secondary">
          Drag to pan · right-drag (or ctrl-drag) to tilt &amp; rotate.
        </Typography>
      </Stack>
    </Paper>
  );
}
