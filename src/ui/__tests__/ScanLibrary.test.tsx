import { render, screen, waitFor } from '@testing-library/react';
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
import { triggerDownload } from '../../lib/download';
import { ScanLibrary } from '../ScanLibrary';

vi.mock('../../lib/download', () => ({ triggerDownload: vi.fn() }));

const DEFAULTS = {
  liftout: DEFAULT_LIFTOUT_OPTIONS,
  sonar: DEFAULT_SONAR_OPTIONS,
  cell: DEFAULT_CELL_OPTIONS,
  category: DEFAULT_CATEGORY_THRESHOLDS,
  colorScale: DEFAULT_COLOR_SCALE_OPTIONS,
};

function makeScan(id: string, name: string): StoredScan {
  return {
    id,
    name,
    deviceType: 'quest',
    contentHash: 'h',
    createdAt: 0,
    updatedAt: 0,
    fileMeta: [],
    thresholds: DEFAULTS,
    layerVisibility: {
      bathymetry: true,
      weed: true,
      fishDensity: true,
      sweetSpots: true,
      temperature: false,
    },
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
  useDeeperMapsStore.setState({
    scans: {
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa': makeScan(
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        'Lake A',
      ),
    },
    activeScanId: null,
    layerBundle: null,
    progress: null,
    warnings: [],
  });
});

afterEach(async () => {
  await closeDeeperMapsDb();
});

describe('<ScanLibrary/>', () => {
  it('renders the upload button and the scan list', () => {
    render(<ScanLibrary onRequestUpload={vi.fn()} />);
    expect(screen.getByRole('button', { name: /upload scan/i })).toBeInTheDocument();
    expect(screen.getByText('Lake A')).toBeInTheDocument();
  });

  it('clicking a scan sets it as active', async () => {
    const user = userEvent.setup();
    render(<ScanLibrary onRequestUpload={vi.fn()} />);
    await user.click(screen.getByText('Lake A'));
    expect(useDeeperMapsStore.getState().activeScanId).toBe('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  });

  it('shows an empty-state hint when there are no scans', () => {
    useDeeperMapsStore.setState({ scans: {} });
    render(<ScanLibrary onRequestUpload={vi.fn()} />);
    expect(screen.getByText(/no scans yet/i)).toBeInTheDocument();
  });

  it('clicking Upload calls onRequestUpload', async () => {
    const onRequestUpload = vi.fn();
    const user = userEvent.setup();
    render(<ScanLibrary onRequestUpload={onRequestUpload} />);
    await user.click(screen.getByRole('button', { name: /upload scan/i }));
    expect(onRequestUpload).toHaveBeenCalled();
  });

  // Coverage extension: exercise the per-item Rename/Delete menu so the
  // ScanListItem branches all execute. The plan defers visual coverage of
  // these flows to Playwright but the per-file 90% gate still needs to hit.
  it('per-item menu: Rename invokes the store action with the new name', async () => {
    const user = userEvent.setup();
    const renameSpy = vi.spyOn(useDeeperMapsStore.getState(), 'renameScan').mockResolvedValue();
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('Lake B');
    render(<ScanLibrary onRequestUpload={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /more actions for lake a/i }));
    await user.click(screen.getByRole('menuitem', { name: /rename/i }));
    expect(promptSpy).toHaveBeenCalled();
    expect(renameSpy).toHaveBeenCalledWith('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Lake B');
    promptSpy.mockRestore();
    renameSpy.mockRestore();
  });

  it('per-item menu: Rename with empty/null input is a no-op', async () => {
    const user = userEvent.setup();
    const renameSpy = vi.spyOn(useDeeperMapsStore.getState(), 'renameScan').mockResolvedValue();
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('   ');
    render(<ScanLibrary onRequestUpload={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /more actions for lake a/i }));
    await user.click(screen.getByRole('menuitem', { name: /rename/i }));
    expect(renameSpy).not.toHaveBeenCalled();
    promptSpy.mockReturnValue(null);
    promptSpy.mockRestore();
    renameSpy.mockRestore();
  });

  it('per-item menu: dismissing via Escape closes without dispatching either action', async () => {
    const user = userEvent.setup();
    const renameSpy = vi.spyOn(useDeeperMapsStore.getState(), 'renameScan').mockResolvedValue();
    const deleteSpy = vi.spyOn(useDeeperMapsStore.getState(), 'deleteScan').mockResolvedValue();
    render(<ScanLibrary onRequestUpload={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /more actions for lake a/i }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(renameSpy).not.toHaveBeenCalled();
    expect(deleteSpy).not.toHaveBeenCalled();
    renameSpy.mockRestore();
    deleteSpy.mockRestore();
  });

  it('per-item menu: Merge scan… opens the merge dialog', async () => {
    const user = userEvent.setup();
    render(<ScanLibrary onRequestUpload={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /more actions for lake a/i }));
    await user.click(screen.getByRole('menuitem', { name: /merge scan/i }));
    expect(screen.getByRole('dialog')).toHaveTextContent(/merge into/i);
    expect(screen.getByText(/merge into/i)).toHaveTextContent('Lake A');
  });

  it('per-item menu: Export builds a blob via the store and triggers a download', async () => {
    const user = userEvent.setup();
    const blob = new Blob(['zip'], { type: 'application/zip' });
    const exportSpy = vi
      .spyOn(useDeeperMapsStore.getState(), 'exportScan')
      .mockResolvedValue({ blob, fileName: 'Lake A.zip' });
    render(<ScanLibrary onRequestUpload={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /more actions for lake a/i }));
    await user.click(screen.getByRole('menuitem', { name: /export/i }));
    await waitFor(() =>
      expect(exportSpy).toHaveBeenCalledWith('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
    );
    await waitFor(() => expect(triggerDownload).toHaveBeenCalledWith(blob, 'Lake A.zip'));
    exportSpy.mockRestore();
  });

  it('shows a merged-source count for scans built from more than one export', () => {
    const merged = makeScan('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Lake C');
    merged.fileMeta = [
      { name: 'first.zip', byteSize: 1, sha256: 'a' },
      { name: 'second.zip', byteSize: 1, sha256: 'b' },
    ];
    useDeeperMapsStore.setState({ scans: { [merged.id]: merged } });
    render(<ScanLibrary onRequestUpload={vi.fn()} />);
    expect(screen.getByText('2 scans merged')).toBeInTheDocument();
  });

  it('per-item menu: Delete invokes the store action when confirmed, no-op when cancelled', async () => {
    const user = userEvent.setup();
    const deleteSpy = vi.spyOn(useDeeperMapsStore.getState(), 'deleteScan').mockResolvedValue();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<ScanLibrary onRequestUpload={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /more actions for lake a/i }));
    await user.click(screen.getByRole('menuitem', { name: /delete/i }));
    expect(confirmSpy).toHaveBeenCalled();
    expect(deleteSpy).toHaveBeenCalledWith('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

    deleteSpy.mockClear();
    confirmSpy.mockReturnValue(false);
    await user.click(screen.getByRole('button', { name: /more actions for lake a/i }));
    await user.click(screen.getByRole('menuitem', { name: /delete/i }));
    expect(deleteSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
    deleteSpy.mockRestore();
  });
});
