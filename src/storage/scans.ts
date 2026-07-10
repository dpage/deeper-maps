import { openDeeperMapsDb } from './db';
import type { StoredRawFile, StoredScan, StoredScanResults } from './types';

export interface RawFileToSave {
  fileName: string;
  blob: Blob;
}

/**
 * Persist a scan and its raw files in a single atomic transaction.
 *
 * `saveScan` is upsert by `scan.id`. Duplicate-content detection is the
 * caller's responsibility — see {@link findScanByContentHash} and the
 * upload flow in src/ui/UploadDialog.tsx (Plan 3 Task 4).
 */
export async function saveScan(scan: StoredScan, rawFiles: RawFileToSave[]): Promise<void> {
  const db = await openDeeperMapsDb();
  const tx = db.transaction(['scans', 'scanRawFiles'], 'readwrite');
  await tx.objectStore('scans').put(scan);
  for (const f of rawFiles) {
    await tx.objectStore('scanRawFiles').put({
      scanId: scan.id,
      fileName: f.fileName,
      blob: f.blob,
    });
  }
  await tx.done;
}

/**
 * Atomically swap a scan's raw files for a new set, updating the scan record
 * itself in the same transaction. Used by the merge flow, where a scan's
 * single stored archive is replaced with a freshly-combined one.
 *
 * Unlike {@link saveScan} (a pure upsert that only ADDS raw files), this DELETES
 * every existing raw file for the scan first, so a merge can't leave the old
 * pre-merge archive behind — which would otherwise be re-parsed alongside the
 * merged one and double-count every row. The cached results are dropped too, so
 * a re-select before re-analysis finishes shows nothing stale rather than the
 * old bundle.
 */
export async function replaceScanAndRawFiles(
  scan: StoredScan,
  rawFiles: RawFileToSave[],
): Promise<void> {
  const db = await openDeeperMapsDb();
  const tx = db.transaction(['scans', 'scanRawFiles', 'scanResults'], 'readwrite');
  await tx.objectStore('scans').put(scan);
  await tx.objectStore('scanResults').delete(scan.id);

  const filesStore = tx.objectStore('scanRawFiles');
  const range = IDBKeyRange.bound([scan.id, ''], [scan.id, '￿']);
  let cursor = await filesStore.openCursor(range);
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  for (const f of rawFiles) {
    await filesStore.put({ scanId: scan.id, fileName: f.fileName, blob: f.blob });
  }
  await tx.done;
}

export async function listScans(): Promise<StoredScan[]> {
  const db = await openDeeperMapsDb();
  const all = await db.getAll('scans');
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function findScanByContentHash(contentHash: string): Promise<StoredScan | undefined> {
  const db = await openDeeperMapsDb();
  return db.getFromIndex('scans', 'contentHash', contentHash);
}

export async function loadScanRawFiles(scanId: string): Promise<StoredRawFile[]> {
  const db = await openDeeperMapsDb();
  const range = IDBKeyRange.bound([scanId, ''], [scanId, '￿']);
  return db.getAll('scanRawFiles', range);
}

export async function renameScan(scanId: string, newName: string): Promise<void> {
  const db = await openDeeperMapsDb();
  const tx = db.transaction('scans', 'readwrite');
  const store = tx.objectStore('scans');
  const scan = await store.get(scanId);
  if (!scan) throw new Error(`renameScan: no scan with id ${scanId}`);
  scan.name = newName;
  scan.updatedAt = Date.now();
  await store.put(scan);
  await tx.done;
}

export async function deleteScan(scanId: string): Promise<void> {
  const db = await openDeeperMapsDb();
  const tx = db.transaction(['scans', 'scanRawFiles', 'scanResults'], 'readwrite');
  await tx.objectStore('scans').delete(scanId);
  await tx.objectStore('scanResults').delete(scanId);

  const filesStore = tx.objectStore('scanRawFiles');
  const range = IDBKeyRange.bound([scanId, ''], [scanId, '￿']);
  let cursor = await filesStore.openCursor(range);
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}

export async function saveScanResults(results: StoredScanResults): Promise<void> {
  const db = await openDeeperMapsDb();
  await db.put('scanResults', results);
}

export async function loadScanResults(scanId: string): Promise<StoredScanResults | undefined> {
  const db = await openDeeperMapsDb();
  return db.get('scanResults', scanId);
}
