import { describe, expect, it } from 'vitest';
import { scanContentHash, sha256Hex } from '../hash';

describe('sha256Hex', () => {
  it('hashes empty input', async () => {
    expect(await sha256Hex(new Uint8Array())).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('hashes "abc"', async () => {
    expect(await sha256Hex(new TextEncoder().encode('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('scanContentHash', () => {
  it('produces the same hash regardless of input order', async () => {
    const a = new TextEncoder().encode('alpha');
    const b = new TextEncoder().encode('beta');
    const h1 = await scanContentHash([
      { fileName: 'a.csv', bytes: a },
      { fileName: 'b.csv', bytes: b },
    ]);
    const h2 = await scanContentHash([
      { fileName: 'b.csv', bytes: b },
      { fileName: 'a.csv', bytes: a },
    ]);
    expect(h1).toBe(h2);
  });

  it('changes when any byte changes', async () => {
    const a = new TextEncoder().encode('alpha');
    const aPrime = new TextEncoder().encode('alphA');
    const h1 = await scanContentHash([{ fileName: 'a.csv', bytes: a }]);
    const h2 = await scanContentHash([{ fileName: 'a.csv', bytes: aPrime }]);
    expect(h1).not.toBe(h2);
  });

  it('changes when a file is renamed', async () => {
    const a = new TextEncoder().encode('alpha');
    const h1 = await scanContentHash([{ fileName: 'a.csv', bytes: a }]);
    const h2 = await scanContentHash([{ fileName: 'b.csv', bytes: a }]);
    expect(h1).not.toBe(h2);
  });
});
