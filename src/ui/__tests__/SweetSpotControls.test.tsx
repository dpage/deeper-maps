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
import { SweetSpotControls } from '../SweetSpotControls';

function makeScan(maxSweetSpots?: number): StoredScan {
  return {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    name: 'Lake A',
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
    ...(maxSweetSpots !== undefined ? { maxSweetSpots } : {}),
  };
}

beforeEach(async () => {
  await closeDeeperMapsDb();
  indexedDB.deleteDatabase('deeper-maps');
  globalThis.__deeperMapsWorker = {
    postMessage: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    terminate: vi.fn(),
  } as unknown as Worker;
});

afterEach(async () => {
  await closeDeeperMapsDb();
});

describe('<SweetSpotControls/>', () => {
  it('shows the current cap and a slider', () => {
    render(<SweetSpotControls scan={makeScan(20)} />);
    expect(screen.getByText('Max shown: 20')).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: /max sweet spots shown/i })).toBeInTheDocument();
  });

  it('falls back to the default cap when the scan has none', () => {
    render(<SweetSpotControls scan={makeScan(undefined)} />);
    expect(screen.getByText('Max shown: 12')).toBeInTheDocument();
  });

  it('invokes setMaxSweetSpots when the slider value changes', () => {
    const scan = makeScan(12);
    const spy = vi.spyOn(useDeeperMapsStore.getState(), 'setMaxSweetSpots').mockResolvedValue();
    render(<SweetSpotControls scan={scan} />);
    const slider = screen.getByRole('slider', { name: /max sweet spots shown/i });
    // MUI sliders respond to arrow keys; ArrowRight steps up by `step` (1).
    slider.focus();
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(spy).toHaveBeenCalledWith(scan.id, 13);
    spy.mockRestore();
  });
});
