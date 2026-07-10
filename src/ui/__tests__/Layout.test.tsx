import { ThemeProvider } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Layout } from '../Layout';
import { theme } from '../theme';

function renderLayout(): void {
  render(
    <ThemeProvider theme={theme}>
      <Layout
        header={<div data-testid="hdr">HEADER</div>}
        drawer={<div data-testid="drw">DRAWER</div>}
        main={<div data-testid="mn">MAIN</div>}
      />
    </ThemeProvider>,
  );
}

/** Force useMediaQuery to report the given match for every query. */
function mockMatchMedia(matches: boolean): void {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

describe('<Layout/>', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    // Reset matchMedia to the desktop default the setup file installs.
    mockMatchMedia(false);
  });

  it('renders header, drawer, and main slot content', () => {
    renderLayout();
    expect(screen.getByTestId('hdr')).toBeInTheDocument();
    expect(screen.getByTestId('drw')).toBeInTheDocument();
    expect(screen.getByTestId('mn')).toBeInTheDocument();
  });

  it('starts open on desktop and the handle collapses/expands the sidebar', async () => {
    mockMatchMedia(false); // desktop
    const user = userEvent.setup();
    renderLayout();

    const aside = screen.getByRole('complementary', { hidden: true });
    // Open: handle offers to hide, sidebar is not aria-hidden.
    expect(screen.getByRole('button', { name: /hide sidebar/i })).toBeInTheDocument();
    expect(aside).toHaveAttribute('aria-hidden', 'false');

    await user.click(screen.getByRole('button', { name: /hide sidebar/i }));

    // Collapsed: handle now offers to show, sidebar is aria-hidden.
    expect(screen.getByRole('button', { name: /show sidebar/i })).toBeInTheDocument();
    expect(aside).toHaveAttribute('aria-hidden', 'true');

    await user.click(screen.getByRole('button', { name: /show sidebar/i }));
    expect(screen.getByRole('button', { name: /hide sidebar/i })).toBeInTheDocument();
    expect(aside).toHaveAttribute('aria-hidden', 'false');
  });

  it('starts collapsed on mobile so the map is visible', () => {
    mockMatchMedia(true); // mobile breakpoint matches
    renderLayout();
    expect(screen.getByRole('button', { name: /show sidebar/i })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { hidden: true })).toHaveAttribute(
      'aria-hidden',
      'true',
    );
  });
});
