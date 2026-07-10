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
import { triggerDownload } from '../lib/download';
import { MergeDialog } from './MergeDialog';

export interface ScanListItemProps {
  scan: StoredScan;
  active: boolean;
}

export function ScanListItem({ scan, active }: ScanListItemProps): JSX.Element {
  const setActiveScan = useDeeperMapsStore((s) => s.setActiveScan);
  const renameScan = useDeeperMapsStore((s) => s.renameScan);
  const deleteScan = useDeeperMapsStore((s) => s.deleteScan);
  const exportScan = useDeeperMapsStore((s) => s.exportScan);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [mergeOpen, setMergeOpen] = useState(false);

  // A scan built from more than one source export is a merge; surface the count
  // so the user can tell combined scans apart at a glance.
  const mergedCount = scan.fileMeta.length;
  const secondary = mergedCount > 1 ? `${mergedCount} scans merged` : undefined;

  function handleRename(): void {
    setMenuAnchor(null);
    const next = window.prompt('Rename scan', scan.name);
    if (next && next.trim() !== '') void renameScan(scan.id, next.trim());
  }
  function handleMerge(): void {
    setMenuAnchor(null);
    setMergeOpen(true);
  }
  async function handleExport(): Promise<void> {
    setMenuAnchor(null);
    const { blob, fileName } = await exportScan(scan.id);
    triggerDownload(blob, fileName);
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
        <ListItemText primary={scan.name} secondary={secondary} />
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
        <MenuItem onClick={handleMerge}>Merge scan…</MenuItem>
        <MenuItem onClick={() => void handleExport()}>Export</MenuItem>
        <MenuItem onClick={handleDelete}>Delete</MenuItem>
      </Menu>
      <MergeDialog scan={scan} open={mergeOpen} onClose={() => setMergeOpen(false)} />
    </>
  );
}
