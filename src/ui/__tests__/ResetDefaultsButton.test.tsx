import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
import { ResetDefaultsButton } from '../ResetDefaultsButton';

const SCAN: StoredScan = {
  id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
  name: 'Y',
  deviceType: 'quest',
  contentHash: 'h',
  createdAt: 0,
  updatedAt: 0,
  fileMeta: [],
  // Non-default thresholds — clicking the button should restore the defaults.
  thresholds: {
    liftout: { ...DEFAULT_LIFTOUT_OPTIONS, hardThresholdM: 99 },
    sonar: { ...DEFAULT_SONAR_OPTIONS, fishMinAmp: 1234 },
    cell: { ...DEFAULT_CELL_OPTIONS, cellSizeM: 7 },
    category: { ...DEFAULT_CATEGORY_THRESHOLDS, goldFishRate: 0.4 },
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

describe('<ResetDefaultsButton/>', () => {
  it('clicking dispatches updateThresholds with the default pipeline options', async () => {
    const user = userEvent.setup();
    render(<ResetDefaultsButton scanId={SCAN.id} />);
    await user.click(screen.getByRole('button', { name: /reset defaults/i }));
    const updated = useDeeperMapsStore.getState().scans[SCAN.id]!;
    expect(updated.thresholds.liftout).toEqual(DEFAULT_LIFTOUT_OPTIONS);
    expect(updated.thresholds.sonar).toEqual(DEFAULT_SONAR_OPTIONS);
    expect(updated.thresholds.cell).toEqual(DEFAULT_CELL_OPTIONS);
    expect(updated.thresholds.category).toEqual(DEFAULT_CATEGORY_THRESHOLDS);
    expect(updated.thresholds.colorScale).toEqual(DEFAULT_COLOR_SCALE_OPTIONS);
  });
});
