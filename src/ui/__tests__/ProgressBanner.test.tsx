import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDeeperMapsStore } from '../../state/store';
import { closeDeeperMapsDb } from '../../storage/db';
import { ProgressBanner } from '../ProgressBanner';

beforeEach(async () => {
  await closeDeeperMapsDb();
  indexedDB.deleteDatabase('deeper-maps');
  globalThis.__deeperMapsWorker = {
    postMessage: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    terminate: vi.fn(),
  } as unknown as Worker;
  useDeeperMapsStore.setState({
    scans: {},
    activeScanId: null,
    layerBundle: null,
    progress: null,
    warnings: [],
  });
});

afterEach(async () => {
  await closeDeeperMapsDb();
});

describe('<ProgressBanner/>', () => {
  it('renders nothing when progress is null', () => {
    const { container } = render(<ProgressBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the stage label and an indeterminate progress indicator (no percent)', () => {
    useDeeperMapsStore.setState({
      progress: { stage: 'analysePings', processed: 1000, total: 5000 },
    });
    render(<ProgressBanner />);
    // Honest, friendly label — no percentage spelled out.
    expect(screen.getByText(/analysing sonar pings…?/i)).toBeInTheDocument();
    // Two progressbar roles: the spinner and the linear bar.
    const bars = screen.getAllByRole('progressbar');
    expect(bars.length).toBeGreaterThanOrEqual(2);
    // Specifically the linear bar must be indeterminate (no aria-valuenow).
    const linear = bars.find((el) => el.getAttribute('aria-label') === 'Analysis in progress');
    expect(linear).toBeDefined();
    expect(linear?.getAttribute('aria-valuenow')).toBeNull();
    // The container is a status region for screen readers.
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders for the parse stage with no determinate value', () => {
    useDeeperMapsStore.setState({
      progress: { stage: 'parse', processed: 0, total: 0 },
    });
    render(<ProgressBanner />);
    expect(screen.getByText(/parsing scan files…?/i)).toBeInTheDocument();
    // No "0%" text any more.
    expect(screen.queryByText(/0\s*%/)).toBeNull();
  });
});
