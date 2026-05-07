import { describe, expect, it } from 'vitest';
import { buildFishIcon, FISH_ICON_HEIGHT, FISH_ICON_WIDTH } from '../fishIcon';

describe('buildFishIcon', () => {
  it('returns a non-empty SDF ImageData of the documented size', () => {
    const img = buildFishIcon();
    expect(img.width).toBe(FISH_ICON_WIDTH);
    expect(img.height).toBe(FISH_ICON_HEIGHT);
    expect(img.data).toBeInstanceOf(Uint8ClampedArray);
    // RGBA, so length = w*h*4
    expect(img.data.length).toBe(FISH_ICON_WIDTH * FISH_ICON_HEIGHT * 4);

    // SDF data must include both interior (alpha high) and exterior pixels
    // (alpha low). If everything is the same, the silhouette failed.
    let minA = 255;
    let maxA = 0;
    for (let i = 3; i < img.data.length; i += 4) {
      const a = img.data[i] ?? 0;
      if (a < minA) minA = a;
      if (a > maxA) maxA = a;
    }
    expect(maxA).toBeGreaterThan(minA);
    // Centre row of the icon should hit the body (alpha > 128 somewhere).
    const cy = Math.floor(FISH_ICON_HEIGHT / 2);
    let centreMaxA = 0;
    for (let x = 0; x < FISH_ICON_WIDTH; x++) {
      const idx = (cy * FISH_ICON_WIDTH + x) * 4 + 3;
      const a = img.data[idx] ?? 0;
      if (a > centreMaxA) centreMaxA = a;
    }
    expect(centreMaxA).toBeGreaterThan(128);
  });

  it('produces values that vary across the image (true SDF, not a binary mask)', () => {
    const img = buildFishIcon();
    const seen = new Set<number>();
    for (let i = 3; i < img.data.length; i += 4) {
      seen.add(img.data[i] ?? 0);
      if (seen.size > 4) break;
    }
    // SDF should yield more than a strict {0, 255} pair — at least 3 distinct
    // alpha values across the image (some interior, some exterior, plus
    // boundary).
    expect(seen.size).toBeGreaterThanOrEqual(3);
  });
});
