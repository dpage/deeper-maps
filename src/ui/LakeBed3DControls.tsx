import RestartAltIcon from '@mui/icons-material/RestartAlt';
import { Box, Button, Divider, Paper, Slider, Stack, Typography } from '@mui/material';
import { viridisRamp } from '../map/colors';
import {
  MAX_VERTICAL_EXAGGERATION,
  MIN_VERTICAL_EXAGGERATION,
  useDeeperMapsStore,
} from '../state/store';

const sliderValue = (v: number | number[]): number => (Array.isArray(v) ? v[0]! : v);

// viridis_r as a CSS gradient (deep = dark, matching the surface colours).
const DEPTH_GRADIENT = `linear-gradient(to right, ${viridisRamp
  .map(([t, c]) => `${c} ${t * 100}%`)
  .join(', ')})`;

/**
 * Overlay control shown only in 3D view: the depth colour key, a
 * vertical-exaggeration slider and a "Reset view" button. Camera orientation
 * (rotate/tilt) is handled by the orbit cube, not here. Hidden entirely in 2D,
 * or when there is no scan / no depth grid to show.
 */
export function LakeBed3DControls(): JSX.Element | null {
  const viewMode = useDeeperMapsStore((s) => s.viewMode);
  const exaggeration = useDeeperMapsStore((s) => s.verticalExaggeration);
  const setExaggeration = useDeeperMapsStore((s) => s.setVerticalExaggeration);
  const resetView = useDeeperMapsStore((s) => s.resetView);
  const layerBundle = useDeeperMapsStore((s) => s.layerBundle);

  if (viewMode !== '3d') return null;
  if (!layerBundle?.depthGrid) return null;

  const depth = layerBundle.scales.depth;

  return (
    <Paper elevation={3} sx={{ position: 'absolute', top: 16, right: 16, p: 1.5, width: 230 }}>
      <Stack spacing={0.5}>
        <Typography variant="caption" sx={{ fontWeight: 600 }}>
          Depth
        </Typography>
        <Box
          sx={{ height: 10, borderRadius: 0.5, background: DEPTH_GRADIENT }}
          aria-label="Depth colour key"
        />
        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Typography variant="caption" color="text.secondary">
            {depth.min.toFixed(1)} m
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {depth.max.toFixed(1)} m
          </Typography>
        </Box>

        <Divider sx={{ my: 0.5 }} />

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
            onChange={(_e, v) => setExaggeration(sliderValue(v))}
            aria-label="Vertical exaggeration"
          />
        </Box>

        <Divider sx={{ my: 0.5 }} />

        <Button
          size="small"
          variant="outlined"
          startIcon={<RestartAltIcon />}
          onClick={() => resetView()}
        >
          Reset view
        </Button>
        <Typography variant="caption" color="text.secondary">
          Drag to pan · pinch to zoom · drag the cube (top-left) to orbit.
        </Typography>
      </Stack>
    </Paper>
  );
}
