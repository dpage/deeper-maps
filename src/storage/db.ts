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

export function openDeeperMapsDb(): Promise<IDBPDatabase<DeeperMapsSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<DeeperMapsSchema>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const scans = db.createObjectStore('scans', { keyPath: 'id' });
          scans.createIndex('contentHash', 'contentHash', { unique: false });
          db.createObjectStore('scanRawFiles', { keyPath: ['scanId', 'fileName'] });
          db.createObjectStore('scanResults', { keyPath: 'scanId' });
        }
      },
    });
  }
  return dbPromise;
}

export async function closeDeeperMapsDb(): Promise<void> {
  if (!dbPromise) return;
  const db = await dbPromise;
  db.close();
  dbPromise = null;
}
