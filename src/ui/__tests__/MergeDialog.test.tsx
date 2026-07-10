import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
import { MergeDialog } from '../MergeDialog';

const DEFAULTS = {
  liftout: DEFAULT_LIFTOUT_OPTIONS,
  sonar: DEFAULT_SONAR_OPTIONS,
  cell: DEFAULT_CELL_OPTIONS,
  category: DEFAULT_CATEGORY_THRESHOLDS,
  colorScale: DEFAULT_COLOR_SCALE_OPTIONS,
};

const SCAN: StoredScan = {
  id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  name: 'Lake A',
  deviceType: 'quest',
  contentHash: 'h',
  createdAt: 0,
  updatedAt: 0,
  fileMeta: [{ name: 'a.zip', byteSize: 1, sha256: 'x' }],
  thresholds: DEFAULTS,
  layerVisibility: {
    bathymetry: true,
    weed: true,
    fishDensity: true,
    sweetSpots: true,
    temperature: false,
  },
};

function arrayBufferPolyfill(this: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as ArrayBuffer);
    fr.onerror = () => reject(fr.error ?? new Error('FileReader failed'));
    fr.readAsArrayBuffer(this);
  });
}

beforeEach(async () => {
  await closeDeeperMapsDb();
  indexedDB.deleteDatabase('deeper-maps');
  if (typeof Blob.prototype.arrayBuffer !== 'function') {
    Blob.prototype.arrayBuffer = arrayBufferPolyfill;
  }
  if (typeof File.prototype.arrayBuffer !== 'function') {
    File.prototype.arrayBuffer = arrayBufferPolyfill;
  }
  globalThis.__deeperMapsWorker = {
    postMessage: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    terminate: vi.fn(),
  } as unknown as Worker;
  useDeeperMapsStore.setState({ scans: { [SCAN.id]: SCAN }, activeScanId: null });
});

afterEach(async () => {
  await closeDeeperMapsDb();
});

describe('<MergeDialog/>', () => {
  it('shows the target scan name and disables Merge until a file is chosen', () => {
    render(<MergeDialog scan={SCAN} open onClose={vi.fn()} />);
    expect(screen.getByText(/merge into/i)).toHaveTextContent('Lake A');
    expect(screen.getByRole('button', { name: /merge & analyse/i })).toBeDisabled();
  });

  it('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn();
    render(<MergeDialog scan={SCAN} open onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('ignores a change event with no file selected (Merge stays disabled)', () => {
    render(<MergeDialog scan={SCAN} open onClose={vi.fn()} />);
    const input = screen.getByLabelText(/merge upload/i, { selector: 'input' });
    fireEvent.change(input, { target: { files: [] } });
    expect(screen.getByRole('button', { name: /merge & analyse/i })).toBeDisabled();
  });

  it('merges the chosen file into the target scan and closes on success', async () => {
    const onClose = vi.fn();
    const mergeSpy = vi.spyOn(useDeeperMapsStore.getState(), 'mergeScan').mockResolvedValue();
    render(<MergeDialog scan={SCAN} open onClose={onClose} />);

    const input = screen.getByLabelText(/merge upload/i, { selector: 'input' });
    const file = new File([new Uint8Array([1, 2, 3])], 'revisit.zip', { type: 'application/zip' });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(screen.getByText('revisit.zip')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /merge & analyse/i }));
    await waitFor(() => expect(mergeSpy).toHaveBeenCalledTimes(1));
    const [targetId, upload] = mergeSpy.mock.calls[0]!;
    expect(targetId).toBe(SCAN.id);
    expect(upload.fileName).toBe('revisit.zip');
    expect(Array.from(upload.bytes)).toEqual([1, 2, 3]);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    mergeSpy.mockRestore();
  });

  it('surfaces a merge error without closing the dialog', async () => {
    const onClose = vi.fn();
    const mergeSpy = vi
      .spyOn(useDeeperMapsStore.getState(), 'mergeScan')
      .mockRejectedValue(new Error('No bathymetry.csv found in scan'));
    render(<MergeDialog scan={SCAN} open onClose={onClose} />);

    const input = screen.getByLabelText(/merge upload/i, { selector: 'input' });
    const file = new File([new Uint8Array([9])], 'bad.zip', { type: 'application/zip' });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(screen.getByText('bad.zip')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /merge & analyse/i }));
    await waitFor(() => expect(screen.getByText(/no bathymetry/i)).toBeInTheDocument());
    expect(onClose).not.toHaveBeenCalled();
    mergeSpy.mockRestore();
  });
});
