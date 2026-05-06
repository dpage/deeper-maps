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

  it('renders the stage and percent when progress is set', () => {
    useDeeperMapsStore.setState({
      progress: { stage: 'analysePings', processed: 1000, total: 5000 },
    });
    render(<ProgressBanner />);
    expect(screen.getByText(/analyse pings/i)).toBeInTheDocument();
    expect(screen.getByText(/20\s*%/)).toBeInTheDocument();
  });

  it('renders 0% when total is 0 (avoids divide-by-zero)', () => {
    useDeeperMapsStore.setState({
      progress: { stage: 'parse', processed: 0, total: 0 },
    });
    render(<ProgressBanner />);
    expect(screen.getByText(/parsing/i)).toBeInTheDocument();
    expect(screen.getByText(/0\s*%/)).toBeInTheDocument();
  });
});
