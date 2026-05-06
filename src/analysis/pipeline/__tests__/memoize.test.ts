import { describe, expect, it, vi } from 'vitest';
import { memoizeStage } from '../memoize';

describe('memoizeStage', () => {
  it('returns cached value when inputs are structurally equal', () => {
    const fn = vi.fn((a: number, b: number) => a + b);
    const memo = memoizeStage(fn);
    expect(memo(1, 2)).toBe(3);
    expect(memo(1, 2)).toBe(3);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('recomputes when an argument changes', () => {
    const fn = vi.fn((a: number, b: number) => a + b);
    const memo = memoizeStage(fn);
    memo(1, 2);
    memo(1, 3);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('treats deeply equal object args as cache hits', () => {
    const fn = vi.fn((opts: { a: number }) => opts.a * 2);
    const memo = memoizeStage(fn);
    memo({ a: 4 });
    memo({ a: 4 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('uses identity equality for non-cloneable values (e.g. Int32Array)', () => {
    const arr = new Int32Array([1, 2, 3]);
    const fn = vi.fn((data: Int32Array) => data.length);
    const memo = memoizeStage(fn);
    memo(arr);
    memo(arr);
    expect(fn).toHaveBeenCalledTimes(1);
    memo(new Int32Array([1, 2, 3]));
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('clear() drops the cache', () => {
    const fn = vi.fn(() => 1);
    const memo = memoizeStage(fn);
    memo();
    memo.clear();
    memo();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('compares plain arrays element-by-element', () => {
    const fn = vi.fn((xs: number[]) => xs.reduce((a, b) => a + b, 0));
    const memo = memoizeStage(fn);
    memo([1, 2, 3]);
    memo([1, 2, 3]); // hit
    expect(fn).toHaveBeenCalledTimes(1);
    memo([1, 2, 4]); // miss
    expect(fn).toHaveBeenCalledTimes(2);
    memo([1, 2]); // miss (different length)
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
