import maplibregl, { type CustomLayerInterface, type Map as MapLibreMap } from 'maplibre-gl';
import type { mat4 } from 'gl-matrix';
import type { LakeBedMesh } from './mesh';

export const LAKEBED_3D_LAYER_ID = 'lakebed-3d';

/** Default vertical exaggeration. Lakes are near-flat in true proportions, so
 *  the relief needs stretching to be legible; the UI lets the user tune it. */
export const DEFAULT_VERTICAL_EXAGGERATION = 6;

// A near-vertical key light with a touch of azimuth, plus a strong ambient
// floor so even flat-lit faces keep their depth colour. Purely cosmetic — it
// makes slopes and drop-offs pop without hiding the viridis depth ramp.
const LIGHT_DIR: readonly [number, number, number] = [0.35, 0.35, 0.87];
const AMBIENT = 0.7;

const VERTEX_SRC = `
precision highp float;
uniform mat4 u_matrix;
uniform float u_exaggeration;
uniform vec3 u_lightDir;
uniform float u_ambient;
attribute vec2 a_pos;      // mercator x, y (surface)
attribute float a_depth;   // metres, positive down
attribute float a_mpm;     // mercator units per metre at this latitude
attribute vec2 a_slope;    // dh/dEast, dh/dNorth (h = -depth), metres/metre
attribute vec3 a_color;    // 0..1 rgb
varying vec3 v_color;
varying float v_shade;
void main() {
  // Bed sits below the surface: altitude = -depth * exaggeration (metres),
  // converted to mercator z via the per-vertex metre factor.
  float z = a_mpm * (-a_depth) * u_exaggeration;
  gl_Position = u_matrix * vec4(a_pos, z, 1.0);
  // Reconstruct the exaggerated surface normal from the slope so shading
  // tracks the exaggeration slider without re-uploading geometry.
  vec3 n = normalize(vec3(-a_slope.x * u_exaggeration, -a_slope.y * u_exaggeration, 1.0));
  float lambert = max(dot(n, normalize(u_lightDir)), 0.0);
  v_shade = u_ambient + (1.0 - u_ambient) * lambert;
  v_color = a_color;
}
`;

const FRAGMENT_SRC = `
precision highp float;
varying vec3 v_color;
varying float v_shade;
void main() {
  // Opaque surface; blend func expects premultiplied alpha, and with a = 1
  // premultiplied rgb == rgb.
  gl_FragColor = vec4(v_color * v_shade, 1.0);
}
`;

/* c8 ignore start - WebGL layer; exercised by Playwright E2E, not unit tests. */

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('LakeBed3DLayer: failed to create shader');
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`LakeBed3DLayer: shader compile failed: ${log}`);
  }
  return shader;
}

/**
 * A MapLibre custom WebGL layer that renders the lake bed as a lit, depth-
 * coloured 3D surface in the map's own GL context — so it shares the camera,
 * the basemap underneath, and the marker overlays on top. The mesh geometry is
 * built by {@link buildLakeBedMesh} (pure, tested); this class only owns the
 * GPU resources and the draw call.
 *
 * Vertical exaggeration is a shader uniform, so the slider re-renders instantly
 * without touching the vertex buffers.
 */
export class LakeBed3DLayer implements CustomLayerInterface {
  readonly id = LAKEBED_3D_LAYER_ID;
  readonly type = 'custom' as const;
  readonly renderingMode = '3d' as const;

  private mesh: LakeBedMesh;
  private exaggeration: number;
  private map: MapLibreMap | null = null;
  private gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private buffers: WebGLBuffer[] = [];
  private indexBuffer: WebGLBuffer | null = null;
  private indexType = 0x1405; // gl.UNSIGNED_INT
  private locations: Record<string, number> = {};
  private uniforms: Record<string, WebGLUniformLocation | null> = {};

  constructor(mesh: LakeBedMesh, exaggeration = DEFAULT_VERTICAL_EXAGGERATION) {
    this.mesh = mesh;
    this.exaggeration = exaggeration;
  }

  /** Swap in a new exaggeration factor and request a repaint. */
  setExaggeration(value: number): void {
    this.exaggeration = value;
    this.map?.triggerRepaint();
  }

  /** Replace the mesh (e.g. after a threshold-driven re-analysis) in place. */
  setMesh(mesh: LakeBedMesh): void {
    this.mesh = mesh;
    if (this.gl) {
      this.uploadBuffers(this.gl);
      this.map?.triggerRepaint();
    }
  }

  onAdd(map: MapLibreMap, gl: WebGLRenderingContext | WebGL2RenderingContext): void {
    this.map = map;
    this.gl = gl;

    const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SRC);
    const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SRC);
    const program = gl.createProgram();
    if (!program) throw new Error('LakeBed3DLayer: failed to create program');
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`LakeBed3DLayer: program link failed: ${gl.getProgramInfoLog(program)}`);
    }
    this.program = program;

    for (const name of ['a_pos', 'a_depth', 'a_mpm', 'a_slope', 'a_color']) {
      this.locations[name] = gl.getAttribLocation(program, name);
    }
    for (const name of ['u_matrix', 'u_exaggeration', 'u_lightDir', 'u_ambient']) {
      this.uniforms[name] = gl.getUniformLocation(program, name);
    }

    // 32-bit indices: native in WebGL2, an extension in WebGL1. A metre-scale
    // lake mesh routinely exceeds 65 535 vertices, so uint indices are required.
    if (typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext) {
      this.indexType = gl.UNSIGNED_INT;
    } else {
      const ext = gl.getExtension('OES_element_index_uint');
      if (!ext) throw new Error('LakeBed3DLayer: OES_element_index_uint unavailable');
      this.indexType = gl.UNSIGNED_INT;
    }

    this.uploadBuffers(gl);
  }

  private uploadBuffers(gl: WebGLRenderingContext | WebGL2RenderingContext): void {
    // Drop any previously-allocated buffers (setMesh path).
    for (const b of this.buffers) gl.deleteBuffer(b);
    this.buffers = [];
    if (this.indexBuffer) {
      gl.deleteBuffer(this.indexBuffer);
      this.indexBuffer = null;
    }

    const { mesh } = this;
    if (mesh.vertexCount === 0) return;

    // Project each vertex's lon/lat to mercator x/y and record the per-vertex
    // metre→mercator factor (latitude-dependent) so the shader can place depth.
    const n = mesh.vertexCount;
    const pos = new Float32Array(n * 2);
    const mpm = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const lon = mesh.lngLat[i * 2]!;
      const lat = mesh.lngLat[i * 2 + 1]!;
      const merc = maplibregl.MercatorCoordinate.fromLngLat({ lng: lon, lat }, 0);
      pos[i * 2] = merc.x;
      pos[i * 2 + 1] = merc.y;
      mpm[i] = merc.meterInMercatorCoordinateUnits();
    }

    const colorF = new Float32Array(n * 3);
    for (let i = 0; i < n * 3; i++) colorF[i] = mesh.color[i]! / 255;

    this.buffers = [
      this.arrayBuffer(gl, pos),
      this.arrayBuffer(gl, mesh.depth),
      this.arrayBuffer(gl, mpm),
      this.arrayBuffer(gl, mesh.slope),
      this.arrayBuffer(gl, colorF),
    ];

    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
    this.indexBuffer = ib;
  }

  private arrayBuffer(
    gl: WebGLRenderingContext | WebGL2RenderingContext,
    data: Float32Array,
  ): WebGLBuffer {
    const buf = gl.createBuffer();
    if (!buf) throw new Error('LakeBed3DLayer: failed to create buffer');
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return buf;
  }

  render(gl: WebGLRenderingContext | WebGL2RenderingContext, matrix: mat4): void {
    if (!this.program || !this.indexBuffer || this.mesh.vertexCount === 0) return;
    gl.useProgram(this.program);

    gl.uniformMatrix4fv(this.uniforms.u_matrix!, false, matrix as Float32Array);
    gl.uniform1f(this.uniforms.u_exaggeration!, this.exaggeration);
    gl.uniform3fv(this.uniforms.u_lightDir!, LIGHT_DIR as unknown as Float32Array);
    gl.uniform1f(this.uniforms.u_ambient!, AMBIENT);

    this.bindAttrib(gl, this.buffers[0]!, this.locations.a_pos!, 2);
    this.bindAttrib(gl, this.buffers[1]!, this.locations.a_depth!, 1);
    this.bindAttrib(gl, this.buffers[2]!, this.locations.a_mpm!, 1);
    this.bindAttrib(gl, this.buffers[3]!, this.locations.a_slope!, 2);
    this.bindAttrib(gl, this.buffers[4]!, this.locations.a_color!, 3);

    // Self-occlude the surface; the shared depth buffer keeps it consistent
    // with any other 3d layers.
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    // The bed is a solid surface — cull nothing so it reads from below too.
    gl.disable(gl.CULL_FACE);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.drawElements(gl.TRIANGLES, this.mesh.indices.length, this.indexType, 0);
  }

  private bindAttrib(
    gl: WebGLRenderingContext | WebGL2RenderingContext,
    buffer: WebGLBuffer,
    loc: number,
    size: number,
  ): void {
    if (loc < 0) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
  }

  onRemove(_map: MapLibreMap, gl: WebGLRenderingContext | WebGL2RenderingContext): void {
    for (const b of this.buffers) gl.deleteBuffer(b);
    this.buffers = [];
    if (this.indexBuffer) gl.deleteBuffer(this.indexBuffer);
    this.indexBuffer = null;
    if (this.program) gl.deleteProgram(this.program);
    this.program = null;
    this.map = null;
    this.gl = null;
  }
}

/* c8 ignore stop */
