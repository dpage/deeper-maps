import type { DepthGrid, ScaleRange } from '../../analysis/types';
import { interpolateStops, quantileColorStops, viridisRamp } from '../colors';

/**
 * A triangle mesh of the lake bed, ready to be uploaded to the GPU by
 * {@link LakeBed3DLayer}. Everything here is plain typed arrays with no
 * MapLibre/WebGL dependency, so the geometry maths is unit-testable in Node.
 *
 * The renderer is responsible for projecting `lngLat` + `depth` into the map's
 * mercator coordinate space and applying the vertical-exaggeration uniform;
 * this builder stays in real-world units so it can be reasoned about directly.
 */
export interface LakeBedMesh {
  /** Per vertex: `[lon, lat]`. Length = `vertexCount · 2`. */
  lngLat: Float64Array;
  /** Per vertex: depth in metres (positive = deeper). Length = `vertexCount`. */
  depth: Float32Array;
  /**
   * Per vertex: local surface slope of the *height* field (height = −depth) in
   * metres per metre, `[dh/dEast, dh/dNorth]`. Length = `vertexCount · 2`. The
   * renderer reconstructs an exaggerated normal from this for shading, so relief
   * lighting tracks the vertical-exaggeration slider without a rebuild.
   */
  slope: Float32Array;
  /** Per vertex: `[r, g, b]` in 0–255, sampled to match the 2D fill. Length = `vertexCount · 3`. */
  color: Uint8Array;
  /** Triangle vertex indices (3 per triangle). */
  indices: Uint32Array;
  vertexCount: number;
  /** Min/max depth actually present in the mesh — drives the camera and legend. */
  depthRange: { min: number; max: number };
}

const EMPTY_MESH: LakeBedMesh = {
  lngLat: new Float64Array(0),
  depth: new Float32Array(0),
  slope: new Float32Array(0),
  color: new Uint8Array(0),
  indices: new Uint32Array(0),
  vertexCount: 0,
  depthRange: { min: 0, max: 0 },
};

/**
 * Turn a {@link DepthGrid} into a triangle mesh of the lake bed.
 *
 * One vertex is emitted per grid cell that carries a sounding (non-NaN); cells
 * with no data are skipped and any quad touching one is dropped, so unscanned
 * water leaves a hole rather than a wall dropping to zero. Two triangles are
 * emitted per fully-populated 2×2 quad.
 *
 * Vertex colour is sampled from the same viridis_r quantile schedule the 2D
 * bathymetry fill uses (via `scale.levels`), so the surface and the legend
 * agree. Slope is estimated with central differences over the height field
 * (height = −depth) for shading.
 *
 * Returns an empty mesh when the grid is absent or has fewer than the three
 * vertices a single triangle needs.
 */
export function buildLakeBedMesh(
  grid: DepthGrid | null | undefined,
  scale: ScaleRange,
): LakeBedMesh {
  if (!grid || grid.width < 2 || grid.height < 2) return EMPTY_MESH;

  const { width, height, cellSizeM, origin, anchor, values } = grid;
  const { lat0, lon0, lonMetresPerDeg, latMetresPerDeg } = anchor;

  // Map each populated grid index → its position in the packed vertex arrays.
  // -1 means "no vertex" (NaN cell); quads referencing one are skipped.
  const vertexIndex = new Int32Array(width * height).fill(-1);

  const lngLat: number[] = [];
  const depth: number[] = [];
  const slope: number[] = [];
  const colorStops = quantileColorStops(scale.levels, viridisRamp);
  const color: number[] = [];

  let vertexCount = 0;
  let minDepth = Infinity;
  let maxDepth = -Infinity;

  const at = (gx: number, gy: number): number => values[gy * width + gx]!;
  const valid = (gx: number, gy: number): boolean =>
    gx >= 0 && gy >= 0 && gx < width && gy < height && !Number.isNaN(at(gx, gy));

  for (let gy = 0; gy < height; gy++) {
    for (let gx = 0; gx < width; gx++) {
      const d = at(gx, gy);
      if (Number.isNaN(d)) continue;

      vertexIndex[gy * width + gx] = vertexCount++;

      const mx = origin.x + gx * cellSizeM;
      const my = origin.y + gy * cellSizeM;
      lngLat.push(lon0 + mx / lonMetresPerDeg, lat0 + my / latMetresPerDeg);
      depth.push(d);

      // Height field h = −depth. Central difference where both neighbours exist,
      // one-sided at the scanned edge, flat if isolated. East is +x (gx), north
      // is +y (gy), matching the metre frame the grid was built in.
      const dhdx = slopeComponent(valid, at, gx, gy, 1, 0, cellSizeM);
      const dhdy = slopeComponent(valid, at, gx, gy, 0, 1, cellSizeM);
      slope.push(dhdx, dhdy);

      const [r, g, b] = interpolateStops(d, colorStops);
      color.push(r, g, b);

      if (d < minDepth) minDepth = d;
      if (d > maxDepth) maxDepth = d;
    }
  }

  if (vertexCount < 3) return EMPTY_MESH;

  // Emit two triangles for every fully-populated quad. Winding is consistent
  // (both CCW in the grid's x-right / y-up frame); the renderer disables
  // face-culling so orientation only matters for the (optional) normal sign,
  // which the shader takes from `slope`, not the geometry.
  const indices: number[] = [];
  for (let gy = 0; gy < height - 1; gy++) {
    for (let gx = 0; gx < width - 1; gx++) {
      const v00 = vertexIndex[gy * width + gx]!;
      const v10 = vertexIndex[gy * width + gx + 1]!;
      const v01 = vertexIndex[(gy + 1) * width + gx]!;
      const v11 = vertexIndex[(gy + 1) * width + gx + 1]!;
      if (v00 < 0 || v10 < 0 || v01 < 0 || v11 < 0) continue;
      indices.push(v00, v10, v11, v00, v11, v01);
    }
  }

  if (indices.length === 0) return EMPTY_MESH;

  return {
    lngLat: Float64Array.from(lngLat),
    depth: Float32Array.from(depth),
    slope: Float32Array.from(slope),
    color: Uint8Array.from(color),
    indices: Uint32Array.from(indices),
    vertexCount,
    depthRange: { min: minDepth, max: maxDepth },
  };
}

/**
 * Central-difference slope of the height field (height = −depth) along one axis,
 * in metres per metre. Falls back to a one-sided difference at the scanned edge
 * and to zero when neither neighbour has data.
 */
function slopeComponent(
  valid: (gx: number, gy: number) => boolean,
  at: (gx: number, gy: number) => number,
  gx: number,
  gy: number,
  dx: number,
  dy: number,
  cellSizeM: number,
): number {
  const hasPos = valid(gx + dx, gy + dy);
  const hasNeg = valid(gx - dx, gy - dy);
  // height = −depth, so dh = −(depth difference).
  if (hasPos && hasNeg) {
    return -(at(gx + dx, gy + dy) - at(gx - dx, gy - dy)) / (2 * cellSizeM);
  }
  if (hasPos) return -(at(gx + dx, gy + dy) - at(gx, gy)) / cellSizeM;
  if (hasNeg) return -(at(gx, gy) - at(gx - dx, gy - dy)) / cellSizeM;
  return 0;
}
