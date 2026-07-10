import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { Box, IconButton, useMediaQuery, useTheme } from '@mui/material';
import { useState, type ReactNode } from 'react';

const DRAWER_WIDTH = 320;
// Cap the drawer on very narrow screens so a sliver of map — and the toggle
// handle — always stays on screen.
const DRAWER_MAX = `min(${DRAWER_WIDTH}px, 85vw)`;

export interface LayoutProps {
  header: ReactNode;
  drawer: ReactNode;
  main: ReactNode;
}

export function Layout({ header, drawer, main }: LayoutProps): JSX.Element {
  const theme = useTheme();
  // On phones the drawer covers most of the map, so start collapsed there and
  // let the user open it deliberately. noSsr evaluates the query synchronously
  // on first paint so the initial open state is right without a flash.
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'), { noSsr: true });
  const [open, setOpen] = useState(!isMobile);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <Box sx={{ flexShrink: 0 }}>{header}</Box>
      <Box sx={{ display: 'flex', flex: 1, minHeight: 0, position: 'relative' }}>
        <Box
          component="aside"
          aria-hidden={!open}
          sx={{
            width: open ? DRAWER_WIDTH : 0,
            maxWidth: DRAWER_MAX,
            flexShrink: 0,
            borderRight: open ? 1 : 0,
            borderColor: 'divider',
            overflow: 'hidden',
            transition: theme.transitions.create('width', {
              easing: theme.transitions.easing.sharp,
              duration: theme.transitions.duration.enteringScreen,
            }),
          }}
        >
          {/* Fixed-width inner wrapper: keeps the content from reflowing while
              the outer width animates between 0 and DRAWER_WIDTH. */}
          <Box sx={{ width: DRAWER_WIDTH, maxWidth: '100%', height: '100%', overflowY: 'auto' }}>
            {drawer}
          </Box>
        </Box>

        {/* Edge handle: always visible, sits at the drawer's trailing edge and
            slides with it. Toggles the drawer open/closed. */}
        <IconButton
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? 'Hide sidebar' : 'Show sidebar'}
          aria-expanded={open}
          size="small"
          sx={{
            position: 'absolute',
            top: '50%',
            left: open ? DRAWER_MAX : 0,
            transform: 'translateY(-50%)',
            zIndex: theme.zIndex.drawer + 1,
            bgcolor: 'background.paper',
            border: 1,
            borderColor: 'divider',
            borderTopLeftRadius: 0,
            borderBottomLeftRadius: 0,
            boxShadow: 1,
            transition: theme.transitions.create('left', {
              easing: theme.transitions.easing.sharp,
              duration: theme.transitions.duration.enteringScreen,
            }),
            '&:hover': { bgcolor: 'background.paper' },
          }}
        >
          {open ? <ChevronLeftIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
        </IconButton>

        <Box sx={{ flex: 1, position: 'relative', minWidth: 0 }}>{main}</Box>
      </Box>
    </Box>
  );
}
