import { Box, LinearProgress, Stack, Typography } from '@mui/material';
import { useDeeperMapsStore } from '../state/store';
import type { PipelineStage } from '../worker/protocol';

const STAGE_LABELS: Record<PipelineStage, string> = {
  parse: 'Parsing',
  cleanBathymetry: 'Cleaning bathymetry',
  analysePings: 'Analyse pings',
  aggregateCells: 'Aggregating cells',
  categoriseCells: 'Categorising cells',
  buildLayers: 'Building layers',
};

export function ProgressBanner(): JSX.Element | null {
  const progress = useDeeperMapsStore((s) => s.progress);
  if (!progress) return null;
  const pct = progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0;
  return (
    <Box
      sx={{
        position: 'absolute',
        bottom: 8,
        left: 8,
        right: 8,
        bgcolor: 'background.paper',
        boxShadow: 2,
        borderRadius: 1,
        p: 1,
      }}
    >
      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="caption" sx={{ minWidth: 160 }}>
          {STAGE_LABELS[progress.stage]} ({pct}%)
        </Typography>
        <LinearProgress
          variant="determinate"
          value={pct}
          sx={{ flex: 1 }}
          aria-label={`${STAGE_LABELS[progress.stage]} progress`}
        />
      </Stack>
    </Box>
  );
}
