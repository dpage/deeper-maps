import { FormControl, MenuItem, Select, type SelectChangeEvent } from '@mui/material';
import type { ViewMode } from '../storage/types';

export interface ViewModeSelectProps {
  value: ViewMode;
  onChange: (next: ViewMode) => void;
}

/**
 * Chooses how the active scan is drawn: the classic 2D top-down overlays, or
 * the 3D explorable lake-bed surface. Sits beside the base-map selector in the
 * header — the two are orthogonal (3D renders over either basemap).
 */
export function ViewModeSelect({ value, onChange }: ViewModeSelectProps): JSX.Element {
  return (
    <FormControl size="small" sx={{ minWidth: 140 }}>
      <Select
        value={value}
        onChange={(e: SelectChangeEvent<ViewMode>) => onChange(e.target.value as ViewMode)}
        aria-label="View mode"
      >
        <MenuItem value="2d">2D map</MenuItem>
        <MenuItem value="3d">3D lake bed</MenuItem>
      </Select>
    </FormControl>
  );
}
