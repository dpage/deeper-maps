import {
  IconButton,
  ListItemButton,
  ListItemSecondaryAction,
  ListItemText,
  Menu,
  MenuItem,
} from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import { useState } from 'react';
import type { StoredScan } from '../storage/types';
import { useDeeperMapsStore } from '../state/store';

export interface ScanListItemProps {
  scan: StoredScan;
  active: boolean;
}

export function ScanListItem({ scan, active }: ScanListItemProps): JSX.Element {
  const setActiveScan = useDeeperMapsStore((s) => s.setActiveScan);
  const renameScan = useDeeperMapsStore((s) => s.renameScan);
  const deleteScan = useDeeperMapsStore((s) => s.deleteScan);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);

  function handleRename(): void {
    setMenuAnchor(null);
    const next = window.prompt('Rename scan', scan.name);
    if (next && next.trim() !== '') void renameScan(scan.id, next.trim());
  }
  function handleDelete(): void {
    setMenuAnchor(null);
    if (window.confirm(`Delete "${scan.name}"? This cannot be undone.`)) {
      void deleteScan(scan.id);
    }
  }

  return (
    <>
      <ListItemButton selected={active} onClick={() => void setActiveScan(scan.id)}>
        <ListItemText primary={scan.name} />
        <ListItemSecondaryAction>
          <IconButton
            edge="end"
            aria-label={`More actions for ${scan.name}`}
            onClick={(e) => setMenuAnchor(e.currentTarget)}
          >
            <MoreVertIcon fontSize="small" />
          </IconButton>
        </ListItemSecondaryAction>
      </ListItemButton>
      <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={() => setMenuAnchor(null)}>
        <MenuItem onClick={handleRename}>Rename</MenuItem>
        <MenuItem onClick={handleDelete}>Delete</MenuItem>
      </Menu>
    </>
  );
}
