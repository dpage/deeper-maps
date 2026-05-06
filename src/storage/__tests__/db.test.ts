import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDeeperMapsDb, openDeeperMapsDb } from '../db';

beforeEach(async () => {
  // fake-indexeddb resets between vitest files (via setup), but make sure
  // each test in this file starts from a fresh db.
  await closeDeeperMapsDb();
  indexedDB.deleteDatabase('deeper-maps');
});

afterEach(async () => {
  await closeDeeperMapsDb();
});

describe('openDeeperMapsDb', () => {
  it('opens the database with the expected object stores', async () => {
    const db = await openDeeperMapsDb();
    expect(Array.from(db.objectStoreNames).sort()).toEqual([
      'scanRawFiles',
      'scanResults',
      'scans',
    ]);
  });

  it('caches the open handle (returns the same instance on repeated calls)', async () => {
    const a = await openDeeperMapsDb();
    const b = await openDeeperMapsDb();
    expect(a).toBe(b);
  });

  it('reopens after closeDeeperMapsDb', async () => {
    const a = await openDeeperMapsDb();
    await closeDeeperMapsDb();
    const b = await openDeeperMapsDb();
    expect(a).not.toBe(b);
  });

  it('scans store has key "id" and an index on contentHash', async () => {
    const db = await openDeeperMapsDb();
    const tx = db.transaction('scans', 'readonly');
    const store = tx.objectStore('scans');
    expect(store.keyPath).toBe('id');
    expect(Array.from(store.indexNames)).toContain('contentHash');
  });

  it('scanRawFiles store has compound key [scanId, fileName]', async () => {
    const db = await openDeeperMapsDb();
    const store = db.transaction('scanRawFiles', 'readonly').objectStore('scanRawFiles');
    expect(store.keyPath).toEqual(['scanId', 'fileName']);
  });

  it('scanResults store has key "scanId"', async () => {
    const db = await openDeeperMapsDb();
    const store = db.transaction('scanResults', 'readonly').objectStore('scanResults');
    expect(store.keyPath).toBe('scanId');
  });
});
