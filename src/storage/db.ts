import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { StoredRawFile, StoredScan, StoredScanResults } from './types';

const DB_NAME = 'deeper-maps';
const DB_VERSION = 1;

export interface DeeperMapsSchema extends DBSchema {
  scans: {
    key: string;
    value: StoredScan;
    indexes: { contentHash: string };
  };
  scanRawFiles: {
    key: [string, string];
    value: StoredRawFile;
  };
  scanResults: {
    key: string;
    value: StoredScanResults;
  };
}

let dbPromise: Promise<IDBPDatabase<DeeperMapsSchema>> | null = null;

/**
 * Opens the IndexedDB and returns a cached promise. The handle is cached
 * for the lifetime of the page; subsequent calls return the same promise.
 *
 * Note: a rejection (Safari private mode, quota exceeded on open — spec §8.3)
 * is also cached. Callers must treat the first failure as terminal for the
 * session and switch to the in-memory fallback at the state-store layer
 * (see src/state/store.ts in Plan 2 Phase C). Reload the page to retry.
 */
export function openDeeperMapsDb(): Promise<IDBPDatabase<DeeperMapsSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<DeeperMapsSchema>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const scans = db.createObjectStore('scans', { keyPath: 'id' });
          // contentHash uniqueness is enforced by the upload flow (the dialog calls
          // findScanByContentHash before saving and prompts the user on hit), not by
          // this index. The index supports lookup, not invariant.
          scans.createIndex('contentHash', 'contentHash', { unique: false });
          db.createObjectStore('scanRawFiles', { keyPath: ['scanId', 'fileName'] });
          db.createObjectStore('scanResults', { keyPath: 'scanId' });
        }
      },
    });
  }
  return dbPromise;
}

/**
 * @internal — test-only. Used to reset the connection between test files; do
 * NOT call from production code paths. Closing the cached handle while
 * other in-flight transactions exist will fail them with TransactionInactive.
 */
export async function closeDeeperMapsDb(): Promise<void> {
  if (!dbPromise) return;
  const db = await dbPromise;
  db.close();
  dbPromise = null;
}
