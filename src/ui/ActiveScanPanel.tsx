import { Box, Stack, Typography } from '@mui/material';
import { useDeeperMapsStore } from '../state/store';
import { LayerControls } from './LayerControls';
import { SweetSpotControls } from './SweetSpotControls';
import { TemperatureStats } from './TemperatureStats';
import { ThresholdControls } from './ThresholdControls';
import { ResetDefaultsButton } from './ResetDefaultsButton';

export function ActiveScanPanel(): JSX.Element | null {
  const activeScanId = useDeeperMapsStore((s) => s.activeScanId);
  const scans = useDeeperMapsStore((s) => s.scans);
  if (!activeScanId) return null;
  const scan = scans[activeScanId];
  if (!scan) return null;
  return (
    <Box sx={{ p: 1, borderTop: 1, borderColor: 'divider' }}>
      <Stack spacing={2}>
        <Typography variant="subtitle1">{scan.name}</Typography>
        <LayerControls scan={scan} />
        <SweetSpotControls scan={scan} />
        <TemperatureStats />
        <ThresholdControls scan={scan} />
        <ResetDefaultsButton scanId={scan.id} />
      </Stack>
    </Box>
  );
}
