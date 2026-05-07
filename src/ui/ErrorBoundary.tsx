import { Alert, Box, Button } from '@mui/material';
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('App error boundary:', error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.error) {
      return (
        <Box sx={{ p: 4 }}>
          <Alert severity="error">
            <Box component="strong" sx={{ display: 'block', mb: 1 }}>
              Something went wrong
            </Box>
            <Box component="pre" sx={{ whiteSpace: 'pre-wrap', m: 0 }}>
              {this.state.error.message}
            </Box>
            <Button sx={{ mt: 2 }} variant="outlined" onClick={() => window.location.reload()}>
              Reload
            </Button>
          </Alert>
        </Box>
      );
    }
    return this.props.children;
  }
}
