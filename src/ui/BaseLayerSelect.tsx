import { FormControl, MenuItem, Select, type SelectChangeEvent } from '@mui/material';
import type { BaseLayerId } from '../storage/types';

export interface BaseLayerSelectProps {
  value: BaseLayerId;
  onChange: (next: BaseLayerId) => void;
}

export function BaseLayerSelect({ value, onChange }: BaseLayerSelectProps): JSX.Element {
  return (
    <FormControl size="small" sx={{ minWidth: 160 }}>
      <Select
        value={value}
        onChange={(e: SelectChangeEvent<BaseLayerId>) => onChange(e.target.value as BaseLayerId)}
        aria-label="Base map layer"
      >
        <MenuItem value="osm">OpenStreetMap</MenuItem>
        <MenuItem value="satellite">Satellite</MenuItem>
      </Select>
    </FormControl>
  );
}
