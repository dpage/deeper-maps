import { Button } from '@mui/material';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import {
  DEFAULT_CATEGORY_THRESHOLDS,
  DEFAULT_CELL_OPTIONS,
  DEFAULT_COLOR_SCALE_OPTIONS,
  DEFAULT_LIFTOUT_OPTIONS,
  DEFAULT_SONAR_OPTIONS,
} from '../analysis/constants';
import { useDeeperMapsStore } from '../state/store';

export interface ResetDefaultsButtonProps {
  scanId: string;
}

export function ResetDefaultsButton({ scanId }: ResetDefaultsButtonProps): JSX.Element {
  const updateThresholds = useDeeperMapsStore((s) => s.updateThresholds);
  return (
    <Button
      size="small"
      startIcon={<RestartAltIcon />}
      onClick={() =>
        updateThresholds(scanId, {
          liftout: DEFAULT_LIFTOUT_OPTIONS,
          sonar: DEFAULT_SONAR_OPTIONS,
          cell: DEFAULT_CELL_OPTIONS,
          category: DEFAULT_CATEGORY_THRESHOLDS,
          colorScale: DEFAULT_COLOR_SCALE_OPTIONS,
        })
      }
    >
      Reset defaults
    </Button>
  );
}
