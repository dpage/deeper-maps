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
import { LayerControls } from '../LayerControls';

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
  layerVisibility: { bathymetry: true, weed: false, fishDensity: true, sweetSpots: true },
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
});
