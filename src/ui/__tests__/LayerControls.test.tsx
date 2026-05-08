import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDeeperMapsStore } from '../../state/store';
import { closeDeeperMapsDb } from '../../storage/db';
import {
  DEFAULT_CATEGORY_THRESHOLDS,
  DEFAULT_CELL_OPTIONS,
  DEFAULT_COLOR_SCALE_OPTIONS,
  DEFAULT_LIFTOUT_OPTIONS,
  DEFAULT_SONAR_OPTIONS,
} from '../../analysis/constants';
import type { StoredScan } from '../../storage/types';
import type { LayerBundle } from '../../analysis/types';
import { LayerControls } from '../LayerControls';

function makeBundle(overrides: Partial<LayerBundle> = {}): LayerBundle {
  return {
    bathymetry: { type: 'FeatureCollection', features: [] },
    weed: { type: 'FeatureCollection', features: [] },
    bathymetryLines: { type: 'FeatureCollection', features: [] },
    fishDensity: { type: 'FeatureCollection', features: [] },
    sweetSpots: { type: 'FeatureCollection', features: [] },
    temperature: { type: 'FeatureCollection', features: [] },
    scales: {
      depth: { min: 0, max: 1, levels: [] },
      weed: { min: 0, max: 1, levels: [] },
      fishRate: { min: 0, max: 1, levels: [] },
      temperature: { min: 0, max: 1, levels: [] },
    },
    bounds: null,
    tempStats: null,
    ...overrides,
  };
}

const SCAN: StoredScan = {
  id: '11111111-1111-1111-1111-111111111111',
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
    weed: false,
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

describe('<LayerControls/>', () => {
  it('renders four toggle switches reflecting current visibility', () => {
    render(<LayerControls scan={SCAN} />);
    const bath = screen.getByLabelText('Bathymetry');
    const weed = screen.getByLabelText('Weed');
    expect((bath as HTMLInputElement).checked).toBe(true);
    expect((weed as HTMLInputElement).checked).toBe(false);
  });

  it('clicking a toggle dispatches setLayerVisibility', async () => {
    const user = userEvent.setup();
    render(<LayerControls scan={SCAN} />);
    await user.click(screen.getByLabelText('Bathymetry'));
    const updated = useDeeperMapsStore.getState().scans[SCAN.id]!;
    expect(updated.layerVisibility.bathymetry).toBe(false);
  });

  it('hides the temperature toggle when tempStats is null', () => {
    useDeeperMapsStore.setState({ layerBundle: makeBundle({ tempStats: null }) });
    render(<LayerControls scan={SCAN} />);
    expect(screen.queryByLabelText(/Temperature/i)).toBeNull();
  });

  it('shows the temperature toggle when tempStats is populated', () => {
    useDeeperMapsStore.setState({
      layerBundle: makeBundle({ tempStats: { min: 12, mean: 14, max: 16 } }),
    });
    render(<LayerControls scan={SCAN} />);
    const toggle = screen.getByLabelText(/Temperature/i);
    expect(toggle).toBeInTheDocument();
  });
});
