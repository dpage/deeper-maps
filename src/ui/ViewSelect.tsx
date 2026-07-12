import { FormControl, MenuItem, Select, type SelectChangeEvent } from '@mui/material';
import type { BaseLayerId, ViewMode } from '../storage/types';

export interface ViewSelectProps {
  viewMode: ViewMode;
  baseLayer: BaseLayerId;
  onViewModeChange: (next: ViewMode) => void;
  onBaseLayerChange: (next: BaseLayerId) => void;
}

/** The single value shown in the selector, encoding both view mode and (for 2D)
 *  the basemap. In 3D the basemap underneath is whatever was last chosen. */
type ViewOption = '3d' | '2d-osm' | '2d-satellite';

/**
 * One control for how the scan is shown: the 3D lake-bed model, or the 2D map
 * over either basemap. Replaces the previous pair of selectors (view mode +
 * base layer), which were easy to mistake for each other. Picking a 2D option
 * sets both the mode and the basemap; picking 3D switches mode and leaves the
 * basemap (used as the underlay) as-is.
 */
export function ViewSelect({
  viewMode,
  baseLayer,
  onViewModeChange,
  onBaseLayerChange,
}: ViewSelectProps): JSX.Element {
  const value: ViewOption = viewMode === '3d' ? '3d' : `2d-${baseLayer}`;

  const handleChange = (e: SelectChangeEvent<ViewOption>): void => {
    const next = e.target.value as ViewOption;
    if (next === '3d') {
      onViewModeChange('3d');
      return;
    }
    onBaseLayerChange(next === '2d-satellite' ? 'satellite' : 'osm');
    onViewModeChange('2d');
  };

  return (
    <FormControl size="small" sx={{ minWidth: 190 }}>
      <Select value={value} onChange={handleChange} aria-label="View">
        <MenuItem value="3d">3D Model</MenuItem>
        <MenuItem value="2d-osm">2D OpenStreetMap</MenuItem>
        <MenuItem value="2d-satellite">2D Satellite</MenuItem>
      </Select>
    </FormControl>
  );
}
