import { Box } from '@mui/material';
import type { ReactNode } from 'react';

const DRAWER_WIDTH = 320;

export interface LayoutProps {
  header: ReactNode;
  drawer: ReactNode;
  main: ReactNode;
}

export function Layout({ header, drawer, main }: LayoutProps): JSX.Element {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <Box sx={{ flexShrink: 0 }}>{header}</Box>
      <Box sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <Box
          sx={{
            width: DRAWER_WIDTH,
            borderRight: 1,
            borderColor: 'divider',
            overflowY: 'auto',
            flexShrink: 0,
          }}
        >
          {drawer}
        </Box>
        <Box sx={{ flex: 1, position: 'relative', minWidth: 0 }}>{main}</Box>
      </Box>
    </Box>
  );
}
