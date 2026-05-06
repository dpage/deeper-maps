import { describe, expect, it } from 'vitest';
import type { BathRow, RawScan, SonarPing } from '../types';

describe('parser types', () => {
  it('RawScan accepts a valid Quest example', () => {
    const example: RawScan = {
      device: 'quest',
      bathymetry: [
        { lat: 51.7, lon: -1.43, depth_m: 1.2, ts_ms: 1717000000000 },
        { lat: 51.7, lon: -1.43, depth_m: 1.3, temp_c: 18.4, ts_ms: 1717000000067 },
      ],
      sonar: [{ ts_ms: 1717000000000, amps: new Int32Array([0, 0, 100, 200]) }],
      source: [{ fileName: 'bathymetry.csv', byteSize: 1000 }],
    };
    expect(example.device).toBe('quest');
  });

  it('BathRow temp_c is optional', () => {
    const a: BathRow = { lat: 0, lon: 0, depth_m: 0, ts_ms: 0 };
    const b: BathRow = { lat: 0, lon: 0, depth_m: 0, temp_c: 18, ts_ms: 0 };
    expect(a.temp_c).toBeUndefined();
    expect(b.temp_c).toBe(18);
  });

  it('SonarPing.amps is an Int32Array (transferable)', () => {
    const p: SonarPing = { ts_ms: 0, amps: new Int32Array([1, 2, 3]) };
    expect(p.amps).toBeInstanceOf(Int32Array);
    expect(p.amps.length).toBe(3);
  });
});
