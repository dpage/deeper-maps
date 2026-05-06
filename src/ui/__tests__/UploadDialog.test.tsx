import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_CATEGORY_THRESHOLDS,
  DEFAULT_CELL_OPTIONS,
  DEFAULT_COLOR_SCALE_OPTIONS,
  DEFAULT_LIFTOUT_OPTIONS,
  DEFAULT_SONAR_OPTIONS,
} from '../../analysis/constants';
import { scanContentHash } from '../../lib/hash';
import { useDeeperMapsStore } from '../../state/store';
import { closeDeeperMapsDb } from '../../storage/db';
import { saveScan } from '../../storage/scans';
import type { StoredScan } from '../../storage/types';
import { UploadDialog } from '../UploadDialog';

const DEFAULTS = {
  liftout: DEFAULT_LIFTOUT_OPTIONS,
  sonar: DEFAULT_SONAR_OPTIONS,
  cell: DEFAULT_CELL_OPTIONS,
  category: DEFAULT_CATEGORY_THRESHOLDS,
  colorScale: DEFAULT_COLOR_SCALE_OPTIONS,
};

function makeStoredScan(id: string, name: string, contentHash: string): StoredScan {
  return {
    id,
    name,
    deviceType: 'quest',
    contentHash,
    createdAt: 0,
    updatedAt: 0,
    fileMeta: [],
    thresholds: DEFAULTS,
    layerVisibility: { bathymetry: true, weed: true, fishDensity: true, sweetSpots: true },
    baseLayer: 'osm',
  };
}

// jsdom does not implement Blob/File.arrayBuffer. The dialog calls
// `file.arrayBuffer()` to compute the content hash, so we polyfill it via
// FileReader (which jsdom does ship).
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

describe('<UploadDialog/>', () => {
  it('renders Cancel and Save buttons; Save is disabled until a file is selected', () => {
    render(<UploadDialog open onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: /cancel/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
  });

  it('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn();
    render(<UploadDialog open onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows the chosen filename after a file is picked', async () => {
    render(<UploadDialog open onClose={vi.fn()} />);
    const input = screen.getByLabelText(/upload/i, { selector: 'input' });
    const file = new File([new Uint8Array([1, 2, 3])], 'test.zip', { type: 'application/zip' });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(screen.getByText('test.zip')).toBeInTheDocument());
  });

  // Coverage extension: exercise handleSave success, handleSave error, and the
  // duplicate-of Alert / Open-existing button. Per-file 90% gate is required.
  it('calls saveAndAnalyse with a freshly-built scan when Save is clicked', async () => {
    const onClose = vi.fn();
    const saveSpy = vi.spyOn(useDeeperMapsStore.getState(), 'saveAndAnalyse').mockResolvedValue();
    render(<UploadDialog open onClose={onClose} />);
    const input = screen.getByLabelText(/upload/i, { selector: 'input' });
    const file = new File([new Uint8Array([9, 9, 9])], 'lake.zip', { type: 'application/zip' });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(screen.getByText('lake.zip')).toBeInTheDocument());

    const saveButton = screen.getByRole('button', { name: /save & analyse/i });
    fireEvent.click(saveButton);
    await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1));
    const callArgs = saveSpy.mock.calls[0];
    expect(callArgs).toBeDefined();
    const [scan, rawFiles] = callArgs!;
    expect(scan.name).toBe('lake');
    expect(scan.fileMeta[0]?.name).toBe('lake.zip');
    expect(rawFiles[0]?.fileName).toBe('lake.zip');
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    saveSpy.mockRestore();
  });

  it('surfaces an error from saveAndAnalyse without closing the dialog', async () => {
    const onClose = vi.fn();
    const saveSpy = vi
      .spyOn(useDeeperMapsStore.getState(), 'saveAndAnalyse')
      .mockRejectedValue(new Error('quota exceeded'));
    render(<UploadDialog open onClose={onClose} />);
    const input = screen.getByLabelText(/upload/i, { selector: 'input' });
    const file = new File([new Uint8Array([1])], 'oops.zip', { type: 'application/zip' });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(screen.getByText('oops.zip')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /save & analyse/i }));
    await waitFor(() => expect(screen.getByText(/quota exceeded/i)).toBeInTheDocument());
    expect(onClose).not.toHaveBeenCalled();
    saveSpy.mockRestore();
  });

  it('surfaces an error from the file-change hash pipeline as an inline alert', async () => {
    // Force the hash pipeline to throw by giving a File whose arrayBuffer rejects.
    const file = new File([new Uint8Array([1, 2, 3])], 'broken.zip');
    Object.defineProperty(file, 'arrayBuffer', {
      value: () => Promise.reject(new Error('read failure')),
    });
    render(<UploadDialog open onClose={vi.fn()} />);
    const input = screen.getByLabelText(/upload/i, { selector: 'input' });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(screen.getByText(/read failure/i)).toBeInTheDocument());
  });

  it('detects a duplicate by content hash and offers Open existing, which activates the existing scan and closes', async () => {
    // Seed an existing scan with a known content hash matching what the
    // dialog will compute for the picked file.
    const bytes = new Uint8Array([5, 5, 5]);
    const fileName = 'dup.zip';
    const expectedHash = await scanContentHash([{ fileName, bytes }]);
    const existing = makeStoredScan(
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      'Already saved',
      expectedHash,
    );
    await saveScan(existing, []);
    useDeeperMapsStore.setState({ scans: { [existing.id]: existing } });

    const setActiveSpy = vi
      .spyOn(useDeeperMapsStore.getState(), 'setActiveScan')
      .mockResolvedValue();

    const onClose = vi.fn();
    render(<UploadDialog open onClose={onClose} />);
    const input = screen.getByLabelText(/upload/i, { selector: 'input' });
    const file = new File([bytes], fileName, { type: 'application/zip' });
    fireEvent.change(input, { target: { files: [file] } });

    // Wait for the duplicate-detection Alert to appear.
    await waitFor(() =>
      expect(
        screen.getByText(/identical contents is already in your library/i),
      ).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: /save as duplicate/i })).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /open existing/i }));
    expect(setActiveSpy).toHaveBeenCalledWith(existing.id);
    expect(onClose).toHaveBeenCalled();
    setActiveSpy.mockRestore();
  });
});
