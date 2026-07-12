import { Paper, Tooltip } from '@mui/material';
import { useDeeperMapsStore } from '../state/store';

/**
 * A small compass, shown over both the 2D and 3D views, indicating the current
 * map orientation. The needle points to true north and rotates as the map is
 * rotated (bearing); clicking it eases the map back to north-up. Sits top-left
 * so it clears the 3D controls (top-right) and the legend (bottom-right).
 */
export function Compass(): JSX.Element {
  const bearing = useDeeperMapsStore((s) => s.viewBearing);
  const resetNorth = useDeeperMapsStore((s) => s.resetNorth);
  const isNorth = Math.abs(((bearing % 360) + 360) % 360) < 0.5;

  return (
    <Tooltip title={isNorth ? 'North up' : 'Reset to north'} placement="right">
      <Paper
        elevation={3}
        component="button"
        onClick={() => resetNorth()}
        aria-label="Reset bearing to north"
        sx={{
          position: 'absolute',
          top: 16,
          left: 16,
          width: 40,
          height: 40,
          p: 0,
          border: 0,
          borderRadius: '50%',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: 'background.paper',
        }}
      >
        {/* Rotate the needle opposite the bearing so it keeps pointing north. */}
        <svg
          width="26"
          height="26"
          viewBox="0 0 32 32"
          style={{ transform: `rotate(${-bearing}deg)` }}
          aria-hidden="true"
        >
          {/* North half (red) and south half (muted), forming a diamond needle. */}
          <polygon points="16,3 11,16 21,16" fill="#d32f2f" />
          <polygon points="16,29 11,16 21,16" fill="#9e9e9e" />
          <circle cx="16" cy="16" r="1.6" fill="#616161" />
        </svg>
      </Paper>
    </Tooltip>
  );
}
