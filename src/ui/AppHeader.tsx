import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { AppBar, Box, IconButton, Stack, Toolbar, Typography } from '@mui/material';
import { useState } from 'react';
import type { BaseLayerId, ViewMode } from '../storage/types';
import { BaseLayerSelect } from './BaseLayerSelect';
import { HelpDialog } from './HelpDialog';
import { ViewModeSelect } from './ViewModeSelect';

export interface AppHeaderProps {
  baseLayer: BaseLayerId;
  onBaseLayerChange: (next: BaseLayerId) => void;
  viewMode: ViewMode;
  onViewModeChange: (next: ViewMode) => void;
}

export function AppHeader({
  baseLayer,
  onBaseLayerChange,
  viewMode,
  onViewModeChange,
}: AppHeaderProps): JSX.Element {
  const [helpOpen, setHelpOpen] = useState(false);
  return (
    <>
      <AppBar position="static" elevation={1} color="default">
        <Toolbar variant="dense">
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Deeper Maps
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <ViewModeSelect value={viewMode} onChange={onViewModeChange} />
            <BaseLayerSelect value={baseLayer} onChange={onBaseLayerChange} />
            <IconButton aria-label="Help" onClick={() => setHelpOpen(true)}>
              <HelpOutlineIcon />
            </IconButton>
          </Stack>
        </Toolbar>
      </AppBar>
      <Box>
        <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
      </Box>
    </>
  );
}
