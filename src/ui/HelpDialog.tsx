import CloseIcon from '@mui/icons-material/Close';
import { Dialog, DialogContent, DialogTitle, IconButton, Typography } from '@mui/material';

export interface HelpDialogProps {
  open: boolean;
  onClose: () => void;
}

export function HelpDialog({ open, onClose }: HelpDialogProps): JSX.Element {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        About Deeper Maps
        <IconButton
          onClick={onClose}
          sx={{ position: 'absolute', right: 8, top: 8 }}
          aria-label="Close"
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Typography variant="body1" gutterBottom>
          Upload a Deeper Quest scan zip to analyse the bathymetry, weed cover, fish density, and
          sweet spots over a real-world map. All processing happens in your browser; no data leaves
          your machine.
        </Typography>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          Threshold defaults are calibrated against carp/bream/tench in shallow lakes. For different
          species or deeper waters, expand the Threshold Controls and adjust.
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Source code, license (PostgreSQL), and v2 TODO list at the project repository.
        </Typography>
      </DialogContent>
    </Dialog>
  );
}
