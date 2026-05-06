import { ThemeProvider } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Layout } from '../Layout';
import { theme } from '../theme';

describe('<Layout/>', () => {
  it('renders header, drawer, and main slot content', () => {
    render(
      <ThemeProvider theme={theme}>
        <Layout
          header={<div data-testid="hdr">HEADER</div>}
          drawer={<div data-testid="drw">DRAWER</div>}
          main={<div data-testid="mn">MAIN</div>}
        />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('hdr')).toBeInTheDocument();
    expect(screen.getByTestId('drw')).toBeInTheDocument();
    expect(screen.getByTestId('mn')).toBeInTheDocument();
  });
});
