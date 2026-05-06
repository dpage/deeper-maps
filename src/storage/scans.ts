import { openDeeperMapsDb } from './db';
import type { StoredRawFile, StoredScan, StoredScanResults } from './types';

export interface RawFileToSave {
  fileName: string;
  blob: Blob;
}

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
