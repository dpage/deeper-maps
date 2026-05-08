import { Stack, Typography } from '@mui/material';
import { useDeeperMapsStore } from '../state/store';

export function TemperatureStats(): JSX.Element | null {
  const stats = useDeeperMapsStore((s) => s.layerBundle?.tempStats);
  if (!stats) return null;
  return (
    <Stack spacing={0.25}>
      <Typography variant="subtitle2">Temperature</Typography>
      <Typography variant="body2">
        {stats.min.toFixed(1)} / {stats.mean.toFixed(1)} / {stats.max.toFixed(1)} °C
        <Typography component="span" variant="caption" sx={{ ml: 1, opacity: 0.7 }}>
          (min / avg / max)
        </Typography>
      </Typography>
    </Stack>
  );
}
