/**
 * SDF (Signed Distance Field) fish icon for the fish-density MapLibre layer.
 *
 * We render a simple side-view fish silhouette (oval body + triangular tail)
 * directly into a binary mask, then run a two-pass distance transform to turn
 * it into an SDF ImageData. MapLibre's `addImage(..., { sdf: true })` then
 * supports `icon-color` tinting from the YlOrRd ramp without re-rendering.
 *
 * We avoid `<canvas>` / `OffscreenCanvas` here because (a) it works in the
 * test environment (jsdom has no real 2D context) and (b) a hand-rolled
 * silhouette is a few dozen lines and gives us pixel-exact control.
 */

export const FISH_ICON_WIDTH = 64;
export const FISH_ICON_HEIGHT = 32;

/**
 * Per-axis radius for the fish body ellipse, expressed as a fraction of the
 * icon dimensions. Tail attaches at the body's left edge.
 */
const BODY_CX_FRAC = 0.55;
const BODY_CY_FRAC = 0.5;
const BODY_RX_FRAC = 0.32;
const BODY_RY_FRAC = 0.28;

/**
 * Tail triangle: apex at the back of the icon (left), base touches the body.
 */
const TAIL_APEX_X_FRAC = 0.05;
const TAIL_APEX_Y_FRAC = 0.5;
const TAIL_BASE_X_FRAC = 0.32;
const TAIL_HALF_HEIGHT_FRAC = 0.32;

/** Radius of distance search, in pixels. SDF range is ±SDF_RANGE. */
const SDF_RANGE = 8;

function buildSilhouette(width: number, height: number): Uint8Array {
  const mask = new Uint8Array(width * height);
  const cx = BODY_CX_FRAC * width;
  const cy = BODY_CY_FRAC * height;
  const rx = BODY_RX_FRAC * width;
  const ry = BODY_RY_FRAC * height;
  const tailApexX = TAIL_APEX_X_FRAC * width;
  const tailApexY = TAIL_APEX_Y_FRAC * height;
  const tailBaseX = TAIL_BASE_X_FRAC * width;
  const tailHalfH = TAIL_HALF_HEIGHT_FRAC * height;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Body — ellipse test
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      const inBody = dx * dx + dy * dy <= 1;

      // Tail — triangle from (tailApexX, tailApexY) to (tailBaseX, ±tailHalfH)
      let inTail = false;
      if (x >= tailApexX && x <= tailBaseX) {
        const t = (x - tailApexX) / Math.max(tailBaseX - tailApexX, 1e-6);
        const yHalf = t * tailHalfH;
        if (Math.abs(y - tailApexY) <= yHalf) inTail = true;
      }

      mask[y * width + x] = inBody || inTail ? 1 : 0;
    }
  }
  return mask;
}

/**
 * Two-pass Euclidean distance transform (Felzenszwalb–Huttenlocher style,
 * simplified for small images). Returns a Float32Array of squared distances
 * to the nearest "in" (or "out") pixel, depending on `inverse`.
 *
 * For our SDF we compute distance-to-outside for inside pixels and
 * distance-to-inside for outside pixels, then combine.
 */
function distanceTransform(
  mask: Uint8Array,
  width: number,
  height: number,
  inverse: boolean,
): Float32Array {
  // Initialise: 0 distance for "source" pixels, ∞ otherwise.
  const dist = new Float32Array(width * height);
  for (let i = 0; i < mask.length; i++) {
    const isSource = inverse ? mask[i] === 0 : mask[i] === 1;
    dist[i] = isSource ? 0 : Infinity;
  }

  // Two passes of a chamfer-like update. In-bounds reads from `dist` always
  // yield a defined number; we cast away the `noUncheckedIndexedAccess`
  // narrowing rather than thread `?? Infinity` through every branch (which
  // would inflate the branch-coverage denominator with unreachable arms).
  const get = (i: number): number => dist[i] as number;

  // Forward pass.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      let d = get(i);
      if (x > 0) {
        const c = get(i - 1) + 1;
        if (c < d) d = c;
      }
      if (y > 0) {
        const c = get(i - width) + 1;
        if (c < d) d = c;
        if (x > 0) {
          const cd = get(i - width - 1) + Math.SQRT2;
          if (cd < d) d = cd;
        }
        if (x < width - 1) {
          const cd = get(i - width + 1) + Math.SQRT2;
          if (cd < d) d = cd;
        }
      }
      dist[i] = d;
    }
  }
  // Backward pass.
  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      const i = y * width + x;
      let d = get(i);
      if (x < width - 1) {
        const c = get(i + 1) + 1;
        if (c < d) d = c;
      }
      if (y < height - 1) {
        const c = get(i + width) + 1;
        if (c < d) d = c;
        if (x < width - 1) {
          const cd = get(i + width + 1) + Math.SQRT2;
          if (cd < d) d = cd;
        }
        if (x > 0) {
          const cd = get(i + width - 1) + Math.SQRT2;
          if (cd < d) d = cd;
        }
      }
      dist[i] = d;
    }
  }
  return dist;
}

/**
 * Build a fish-shaped SDF ImageData suitable for
 * `map.addImage('fish-icon', img, { sdf: true })`.
 */
export function buildFishIcon(): ImageData {
  const w = FISH_ICON_WIDTH;
  const h = FISH_ICON_HEIGHT;
  const mask = buildSilhouette(w, h);

  // Distance from outside pixels to the nearest "in" pixel (positive distance
  // outside the silhouette in the standard SDF convention).
  const distOut = distanceTransform(mask, w, h, false);
  // Distance from inside pixels to the nearest "out" pixel (positive inside).
  const distIn = distanceTransform(mask, w, h, true);

  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const inside = mask[i] === 1;
    // Convention: 128 = on the boundary, > 128 inside, < 128 outside.
    // distIn/distOut are dense Float32Arrays — the noUncheckedIndexedAccess
    // `| undefined` arm is unreachable for in-range indices.
    const signed = inside ? (distIn[i] as number) : -(distOut[i] as number);
    // Uint8ClampedArray automatically clamps to [0, 255], so we can skip an
    // explicit clamp here (and the extra branches it would introduce).
    data[i * 4] = 255;
    data[i * 4 + 1] = 255;
    data[i * 4 + 2] = 255;
    data[i * 4 + 3] = Math.round(128 + (signed / SDF_RANGE) * 127);
  }
  // jsdom and Node lack a global `ImageData`; the browser has it. Tests
  // exercise the fallback object path, production exercises the `new
  // ImageData` path. The whole branch is c8-ignored: the fallback exists
  // purely to satisfy the test environment, and the production line can't
  // be reached from vitest.
  /* c8 ignore start */
  if (typeof ImageData === 'undefined') {
    return { data, width: w, height: h, colorSpace: 'srgb' } as unknown as ImageData;
  }
  return new ImageData(data, w, h);
}
/* c8 ignore stop */
