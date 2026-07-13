import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { AppBar, IconButton, Stack, Toolbar, Typography } from '@mui/material';
import { useState } from 'react';
import type { BaseLayerId, ViewMode } from '../storage/types';
import { HelpPanel } from './HelpPanel';
import { ViewSelect } from './ViewSelect';

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
            <ViewSelect
              viewMode={viewMode}
              baseLayer={baseLayer}
              onViewModeChange={onViewModeChange}
              onBaseLayerChange={onBaseLayerChange}
            />
            <IconButton aria-label="Help" onClick={() => setHelpOpen(true)}>
              <HelpOutlineIcon />
            </IconButton>
          </Stack>
        </Toolbar>
      </AppBar>
      <HelpPanel open={helpOpen} onClose={() => setHelpOpen(false)} />
    </>
  );
}
