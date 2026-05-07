import { Box, CircularProgress, LinearProgress, Stack, Typography } from '@mui/material';
import { useDeeperMapsStore } from '../state/store';
import type { PipelineStage } from '../worker/protocol';

const STAGE_LABELS: Record<PipelineStage, string> = {
  parse: 'Parsing scan files',
  cleanBathymetry: 'Cleaning bathymetry',
  analysePings: 'Analysing sonar pings',
  aggregateCells: 'Aggregating cells',
  categoriseCells: 'Categorising cells',
  buildLayers: 'Building map layers',
};

/**
 * In-flight analysis indicator. We deliberately render an *indeterminate*
 * progress bar rather than a determinate one: each stage emits `processed
 * 0/N` then runs synchronously to `processed N/N`, so the percentage we'd
 * compute spends almost the entire stage at 0%. Showing "yes, work is
 * happening" honestly is more useful than a stuck-at-0 percentage.
 */
export function ProgressBanner(): JSX.Element | null {
  const progress = useDeeperMapsStore((s) => s.progress);
  if (!progress) return null;
  return (
    <Box
      sx={{
        position: 'absolute',
        top: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        bgcolor: 'background.paper',
        boxShadow: 4,
        borderRadius: 2,
        p: 2,
        minWidth: 320,
        zIndex: 1000,
        border: '1px solid',
        borderColor: 'primary.main',
      }}
      role="status"
      aria-live="polite"
    >
      <Stack spacing={1}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <CircularProgress size={20} aria-label="Analysis spinner" />
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            {STAGE_LABELS[progress.stage]}…
          </Typography>
        </Stack>
        <LinearProgress aria-label="Analysis in progress" />
      </Stack>
    </Box>
  );
}
