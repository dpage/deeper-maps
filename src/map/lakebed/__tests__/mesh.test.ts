import { describe, expect, it } from 'vitest';
import type { DepthGrid, ScaleRange } from '../../../analysis/types';
import { buildLakeBedMesh } from '../mesh';

/** A simple square grid at the equator/prime-meridian so metres↔degrees maths
 *  is easy to reason about. `values` is row-major, length width·height. */
function grid(width: number, height: number, values: number[], cellSizeM = 1): DepthGrid {
  return {
    width,
    height,
    cellSizeM,
    origin: { x: 0, y: 0 },
    anchor: { lat0: 0, lon0: 0, lonMetresPerDeg: 111000, latMetresPerDeg: 111000 },
    values: Float32Array.from(values),
  };
}

const SCALE: ScaleRange = { min: 0, max: 10, levels: [0, 2, 4, 6, 8, 10] };

describe('buildLakeBedMesh', () => {
  it('returns an empty mesh for a null / undefined grid', () => {
    for (const g of [null, undefined]) {
      const mesh = buildLakeBedMesh(g, SCALE);
      expect(mesh.vertexCount).toBe(0);
      expect(mesh.indices.length).toBe(0);
    }
  });

  it('returns an empty mesh for a degenerate (sub-2×2) grid', () => {
    expect(buildLakeBedMesh(grid(1, 5, [1, 2, 3, 4, 5]), SCALE).vertexCount).toBe(0);
    expect(buildLakeBedMesh(grid(5, 1, [1, 2, 3, 4, 5]), SCALE).vertexCount).toBe(0);
  });

  it('builds one vertex per populated cell and two triangles per full quad', () => {
    // 2×2 grid, all populated → 4 vertices, 1 quad → 2 triangles → 6 indices.
    const mesh = buildLakeBedMesh(grid(2, 2, [1, 2, 3, 4]), SCALE);
    expect(mesh.vertexCount).toBe(4);
    expect(mesh.indices.length).toBe(6);
    expect(mesh.lngLat.length).toBe(8);
    expect(mesh.depth.length).toBe(4);
    expect(mesh.slope.length).toBe(8);
    expect(mesh.color.length).toBe(12);
    // Every index references a real vertex.
    for (const i of mesh.indices) expect(i).toBeLessThan(mesh.vertexCount);
  });

  it('reprojects grid metres back to lon/lat via the anchor', () => {
    // cellSizeM = 111000 → exactly one degree per grid step, so cell (1,1) is at
    // lon 1, lat 1.
    const mesh = buildLakeBedMesh(grid(2, 2, [1, 1, 1, 1], 111000), SCALE);
    // Vertex order is row-major: (0,0),(1,0),(0,1),(1,1).
    expect(mesh.lngLat[0]).toBeCloseTo(0, 6);
    expect(mesh.lngLat[1]).toBeCloseTo(0, 6);
    expect(mesh.lngLat[6]).toBeCloseTo(1, 6); // vertex (1,1) lon
    expect(mesh.lngLat[7]).toBeCloseTo(1, 6); // vertex (1,1) lat
  });

  it('skips NaN cells and any quad that touches one', () => {
    // 3×3 with the centre missing. Each of the four quads touches the missing
    // centre, so NO full quad survives — the builder collapses to an empty mesh
    // (vertices with no triangles would render nothing anyway).
    const withHole = grid(3, 3, [1, 1, 1, 1, NaN, 1, 1, 1, 1]);
    const mesh = buildLakeBedMesh(withHole, SCALE);
    expect(mesh.indices.length).toBe(0);
    expect(mesh.vertexCount).toBe(0);
  });

  it('keeps quads that are fully populated even when other cells are NaN', () => {
    // 3×2: top-right cell missing. The left quad (cols 0–1) is intact; the right
    // quad (cols 1–2) touches the NaN and is dropped.
    // Layout (row-major): row0 = [a b NaN], row1 = [c d e]
    const mesh = buildLakeBedMesh(grid(3, 2, [1, 2, NaN, 3, 4, 5]), SCALE);
    expect(mesh.vertexCount).toBe(5);
    expect(mesh.indices.length).toBe(6); // exactly one surviving quad
  });

  it('reports the true depth range of the populated cells', () => {
    const mesh = buildLakeBedMesh(grid(2, 2, [2.5, 9, 4, 7.25]), SCALE);
    expect(mesh.depthRange.min).toBeCloseTo(2.5);
    expect(mesh.depthRange.max).toBeCloseTo(9);
  });

  it('colours a deeper vertex darker than a shallower one (viridis_r)', () => {
    const mesh = buildLakeBedMesh(grid(2, 2, [0, 0, 0, 10]), SCALE);
    // Vertex 0 (depth 0) vs vertex 3 (depth 10): the deep one should be darker,
    // i.e. lower summed luminance under viridis_r.
    const lum = (i: number): number =>
      mesh.color[i * 3]! + mesh.color[i * 3 + 1]! + mesh.color[i * 3 + 2]!;
    expect(lum(3)).toBeLessThan(lum(0));
  });

  it('estimates a downward east slope where depth increases eastward', () => {
    // Depth increases with gx (east): height = -depth decreases eastward, so
    // dh/dEast should be negative at the interior vertex.
    // 3×2 grid, depths per column 0,5,10.
    const mesh = buildLakeBedMesh(grid(3, 2, [0, 5, 10, 0, 5, 10]), SCALE);
    // Interior column is gx=1 → vertex index 1 (row 0). slope[1*2] = dh/dEast.
    expect(mesh.slope[1 * 2]).toBeLessThan(0);
  });

  it('produces a flat (zero) slope for an isolated-axis vertex', () => {
    // A 2×2 flat grid: every vertex is an edge vertex, one-sided differences of
    // a constant field are zero.
    const mesh = buildLakeBedMesh(grid(2, 2, [4, 4, 4, 4]), SCALE);
    // Use closeTo so ±0 both pass (one-sided differences can yield -0).
    for (let i = 0; i < mesh.slope.length; i++) expect(mesh.slope[i]).toBeCloseTo(0);
  });
});
