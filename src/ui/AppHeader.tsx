import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { AppBar, Box, IconButton, Stack, Toolbar, Typography } from '@mui/material';
import { useState } from 'react';
import type { BaseLayerId } from '../storage/types';
import { BaseLayerSelect } from './BaseLayerSelect';
import { HelpDialog } from './HelpDialog';

export interface AppHeaderProps {
  baseLayer: BaseLayerId;
  onBaseLayerChange: (next: BaseLayerId) => void;
}

export function AppHeader({ baseLayer, onBaseLayerChange }: AppHeaderProps): JSX.Element {
  const [helpOpen, setHelpOpen] = useState(false);
  return (
    <>
      <AppBar position="static" elevation={1} color="default">
        <Toolbar variant="dense">
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Deeper Maps
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center">
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
