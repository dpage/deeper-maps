import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_CATEGORY_THRESHOLDS,
  DEFAULT_CELL_OPTIONS,
  DEFAULT_COLOR_SCALE_OPTIONS,
  DEFAULT_LIFTOUT_OPTIONS,
  DEFAULT_SONAR_OPTIONS,
} from '../../analysis/constants';
import { useDeeperMapsStore } from '../../state/store';
import { closeDeeperMapsDb } from '../../storage/db';
import type { StoredScan } from '../../storage/types';
import { ThresholdControls } from '../ThresholdControls';

const SCAN: StoredScan = {
  id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  name: 'X',
  deviceType: 'quest',
  contentHash: 'h',
  createdAt: 0,
  updatedAt: 0,
  fileMeta: [],
  thresholds: {
    liftout: DEFAULT_LIFTOUT_OPTIONS,
    sonar: DEFAULT_SONAR_OPTIONS,
    cell: DEFAULT_CELL_OPTIONS,
    category: DEFAULT_CATEGORY_THRESHOLDS,
    colorScale: DEFAULT_COLOR_SCALE_OPTIONS,
  },
  layerVisibility: {
    bathymetry: true,
    weed: true,
    fishDensity: true,
    sweetSpots: true,
    temperature: false,
  },
};

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
    scans: { [SCAN.id]: SCAN },
    activeScanId: SCAN.id,
    layerBundle: null,
    progress: null,
    warnings: [],
  });
});

afterEach(async () => {
  await closeDeeperMapsDb();
});

describe('<ThresholdControls/>', () => {
  it('renders four accordion sections', () => {
    render(<ThresholdControls scan={SCAN} />);
    expect(screen.getByText(/lift-out detection/i)).toBeInTheDocument();
    expect(screen.getByText(/sonar analysis/i)).toBeInTheDocument();
    expect(screen.getByText(/cell aggregation/i)).toBeInTheDocument();
    expect(screen.getByText(/sweet-spot categories/i)).toBeInTheDocument();
  });

  it('expanding a section reveals its sliders', async () => {
    render(<ThresholdControls scan={SCAN} />);
    const liftoutHeader = screen.getByText(/lift-out detection/i);
    liftoutHeader.click();
    // After expansion, the "Hard threshold (m)" label should be visible.
    expect(await screen.findByText(/hard threshold/i)).toBeInTheDocument();
  });

  it('changing a slider in each accordion dispatches updateThresholds', async () => {
    render(<ThresholdControls scan={SCAN} />);

    // Expand all four sections so their sliders are mounted.
    screen.getByText(/lift-out detection/i).click();
    screen.getByText(/sonar analysis/i).click();
    screen.getByText(/cell aggregation/i).click();
    screen.getByText(/sweet-spot categories/i).click();

    // Wait for sliders to render in each section.
    await screen.findByLabelText('Hard threshold (m)');
    await screen.findByLabelText('Bottom-hug zone (m)');
    await screen.findByLabelText('Cell size (m)');
    await screen.findByLabelText('Gold fish-rate threshold');

    // Fire a change on one slider per section to exercise each onChange handler.
    // MUI Slider exposes an <input type="range"> reachable via the aria-label;
    // both `input` and `change` events trigger its onChange prop in jsdom.
    const labels = [
      'Hard threshold (m)',
      'Session gap (s)',
      'MAD multiplier',
      'Global outlier strictness',
      'Bottom-hug zone (m)',
      'Fish min amplitude',
      'Fish min run length (bins)',
      'Weed min amplitude',
      'Cell size (m)',
      'Min pings per cell',
      'Gold fish-rate threshold',
      'Gold max weed (m)',
      'Bronze fish-rate threshold',
      'Weeded min weed (m)',
    ];
    for (const label of labels) {
      const input = screen.getByLabelText(label);
      // Two events for belt-and-braces: jsdom's MUI Slider listens to both.
      fireEvent.change(input, { target: { value: '1' } });
      fireEvent.input(input, { target: { value: '1' } });
    }

    const updated = useDeeperMapsStore.getState().scans[SCAN.id]!;
    // After all the slider events fire, the store's `updateThresholds` action
    // has been dispatched at least once (synchronous part runs immediately).
    // We assert the store's thresholds object is no longer the original SCAN one.
    expect(updated.thresholds).not.toBe(SCAN.thresholds);
  });
});
