import { Box, Button, List, Stack, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { useDeeperMapsStore } from '../state/store';
import { ScanListItem } from './ScanListItem';

export interface ScanLibraryProps {
  onRequestUpload: () => void;
}

export function ScanLibrary({ onRequestUpload }: ScanLibraryProps): JSX.Element {
  const scans = useDeeperMapsStore((s) => s.scans);
  const activeScanId = useDeeperMapsStore((s) => s.activeScanId);
  const list = Object.values(scans).sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <Stack sx={{ p: 1 }}>
      <Button variant="contained" startIcon={<AddIcon />} onClick={onRequestUpload} sx={{ mb: 1 }}>
        Upload scan
      </Button>
      {list.length === 0 ? (
        <Box sx={{ p: 2 }}>
          <Typography variant="body2" color="text.secondary">
            No scans yet. Click Upload scan to add a Quest export (.zip).
          </Typography>
        </Box>
      ) : (
        <List dense>
          {list.map((s) => (
            <ScanListItem key={s.id} scan={s} active={s.id === activeScanId} />
          ))}
        </List>
      )}
    </Stack>
  );
}
