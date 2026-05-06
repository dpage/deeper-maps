import { describe, expect, it } from 'vitest';
import {
  buildSweetSpotsStyle,
  SWEET_SPOTS_LAYER_ID,
  SWEET_SPOTS_SOURCE_ID,
} from '../sweetSpots';

describe('buildSweetSpotsStyle', () => {
  it('returns a categorical-colour circle layer', () => {
    const style = buildSweetSpotsStyle();
    expect(SWEET_SPOTS_SOURCE_ID).toBe('sweet-spots');
    expect(SWEET_SPOTS_LAYER_ID).toBe('sweet-spots-circles');
    expect(style.layer.type).toBe('circle');
    const paint = style.layer.paint as Record<string, unknown>;
    expect(JSON.stringify(paint['circle-color'])).toContain('color');
    expect(paint['circle-opacity'] as number).toBe(1);
    expect(paint['circle-stroke-color'] as string).toBe('#ffffff');
  });
});
