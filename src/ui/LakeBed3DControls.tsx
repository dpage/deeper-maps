import RestartAltIcon from '@mui/icons-material/RestartAlt';
import { Box, Button, Divider, Paper, Slider, Stack, Typography } from '@mui/material';
import {
  MAX_VERTICAL_EXAGGERATION,
  MAX_VIEW_PITCH,
  MIN_VERTICAL_EXAGGERATION,
  MIN_VIEW_PITCH,
  useDeeperMapsStore,
} from '../state/store';

const sliderValue = (v: number | number[]): number => (Array.isArray(v) ? v[0]! : v);

/**
 * Overlay control shown only in 3D view: vertical-exaggeration and camera-tilt
 * sliders plus a "Reset view" button. The tilt slider matters most on touch
 * devices, where two-finger tilt is undiscoverable and easy to trigger by
 * accident — the slider gives direct, predictable control. Hidden entirely in
 * 2D, or when there is no scan / no depth grid to show.
 */
export function LakeBed3DControls(): JSX.Element | null {
  const viewMode = useDeeperMapsStore((s) => s.viewMode);
  const exaggeration = useDeeperMapsStore((s) => s.verticalExaggeration);
  const setExaggeration = useDeeperMapsStore((s) => s.setVerticalExaggeration);
  const pitch = useDeeperMapsStore((s) => s.viewPitch);
  const setViewPitch = useDeeperMapsStore((s) => s.setViewPitch);
  const resetView = useDeeperMapsStore((s) => s.resetView);
  const layerBundle = useDeeperMapsStore((s) => s.layerBundle);

  if (viewMode !== '3d') return null;
  if (!layerBundle?.depthGrid) return null;

  return (
    <Paper elevation={3} sx={{ position: 'absolute', top: 16, right: 16, p: 1.5, width: 230 }}>
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
            onChange={(_e, v) => setExaggeration(sliderValue(v))}
            aria-label="Vertical exaggeration"
          />
        </Box>

        <Typography variant="caption" sx={{ fontWeight: 600 }}>
          Tilt {Math.round(pitch)}°
        </Typography>
        <Box sx={{ px: 0.5 }}>
          <Slider
            size="small"
            value={pitch}
            min={MIN_VIEW_PITCH}
            max={MAX_VIEW_PITCH}
            step={1}
            marks={[
              { value: MIN_VIEW_PITCH, label: 'flat' },
              { value: MAX_VIEW_PITCH, label: `${MAX_VIEW_PITCH}°` },
            ]}
            valueLabelDisplay="auto"
            onChange={(_e, v) => setViewPitch(sliderValue(v))}
            aria-label="Camera tilt"
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
          Drag to pan · pinch to zoom · two-finger drag (or the Tilt slider) to tilt.
        </Typography>
      </Stack>
    </Paper>
  );
}
