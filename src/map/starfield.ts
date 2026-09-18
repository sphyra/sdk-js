// Stars in the night sky and in space around the globe.
//
// MapLibre draws a sky gradient and a globe atmosphere but no stars, so Sphyra adds them as a
// custom layer. Two things make this harder than a full-screen overlay:
//
//  * stars must not paint over the map, and the depth buffer cannot be trusted — with terrain on,
//    MapLibre renders through a texture and hands custom layers a disabled depth mode;
//  * the map is a plane at city zooms and a sphere when the camera pulls back.
//
// So the mask is geometric instead: unproject each fragment through the matrix MapLibre hands the
// layer, and keep the fragment only if that view ray never reaches the ground — it points away
// from the ground plane (mercator) or misses the planet (globe). That holds with or without
// terrain, in 2D and 3D, and through the globe↔mercator transition.

/** Layer id — kept first in the layer order so stars sit behind every map layer. */
export const STARFIELD_LAYER_ID = "sphyra-stars";

/** Stars per sphere shell cell: bigger = more, smaller stars. Tuned against Mapbox's night globe. */
const STAR_GRID = 190;
/** Share of grid cells that hold a star. */
const STAR_FILL = 0.11;
/**
 * How much of the starfield survives under a sky (mercator) rather than in space (globe). Mapbox
 * shows about half as much star above a lit city as it does around the planet — measured as bright
 * pixels per sky band on its night renders.
 */
const GROUND_STAR_FACTOR = 0.5;
/** Star radius in pixels. */
const STAR_RADIUS_PX = 1.5;

const VERTEX_SOURCE = `
attribute vec2 a_pos;
varying vec2 v_ndc;
void main() {
  v_ndc = a_pos;
  gl_Position = vec4(a_pos, 1.0, 1.0);
}
`;

const FRAGMENT_SOURCE = `
precision highp float;
varying vec2 v_ndc;

uniform mat4 u_inv_globe;
uniform mat4 u_inv_flat;
uniform float u_transition;
uniform vec2 u_resolution;
uniform float u_fov;
uniform float u_intensity;

vec3 rayThrough(mat4 inverseMatrix, out vec3 origin) {
  vec4 near = inverseMatrix * vec4(v_ndc, -1.0, 1.0);
  vec4 far = inverseMatrix * vec4(v_ndc, 1.0, 1.0);
  origin = near.xyz / near.w;
  return normalize(far.xyz / far.w - origin);
}

/** 1.0 where the ray flies off into the sky, 0.0 where it lands on the ground plane. */
float flatSkyMask(out vec3 direction, out float aboveHorizon) {
  vec3 origin;
  direction = rayThrough(u_inv_flat, origin);
  // The plane is z = 0 and the camera is off it; which side (and so which sign is "up") depends on
  // the matrix, so compare against the camera's own side instead of assuming one.
  float up = direction.z * sign(origin.z);
  aboveHorizon = up;
  return step(0.0, up);
}

/** 1.0 where the ray misses the planet (a unit sphere at the origin in globe space). */
float globeSkyMask(out vec3 direction) {
  vec3 origin;
  direction = rayThrough(u_inv_globe, origin);
  float b = dot(origin, direction);
  float c = dot(origin, origin) - 1.0;
  float discriminant = b * b - c;
  if (discriminant < 0.0) return 1.0;
  float hit = -b - sqrt(discriminant);
  return step(hit, 0.0);
}

float hash(vec3 cell) {
  vec3 p = fract(cell * 0.1031 + vec3(0.1, 0.17, 0.23));
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

void main() {
  vec3 flatDirection;
  float aboveHorizon;
  float flatMask = flatSkyMask(flatDirection, aboveHorizon);

  vec3 globeDirection;
  float globeMask = u_transition > 0.0 ? globeSkyMask(globeDirection) : 1.0;

  // Mid-transition neither space is the truth, so only draw where both agree it is sky.
  float mask = u_transition <= 0.0 ? flatMask : (u_transition >= 1.0 ? globeMask : min(flatMask, globeMask));
  if (mask <= 0.0) discard;

  // Follow the projection that is actually on screen, so stars stay put as the camera turns.
  vec3 direction = u_transition >= 0.5 ? globeDirection : flatDirection;

  // Under a sky the preset decides how much star survives the daylight, and the last of it fades
  // into the horizon haze: aboveHorizon is the sine of the elevation angle, and a pitched city view
  // only shows ~12 degrees of sky, so the fade has to be shallow or it empties the sky. Space is
  // starry whatever the hour — Mapbox shows the same stars around its daylight globe.
  float underSky = smoothstep(0.0, 0.05, aboveHorizon) * ${GROUND_STAR_FACTOR.toFixed(2)} * u_intensity;
  float strength = mix(underSky, 1.0, u_transition);
  if (strength <= 0.0) discard;

  vec3 grid = direction * ${STAR_GRID.toFixed(1)};
  vec3 cell = floor(grid);
  float present = step(hash(cell), ${STAR_FILL.toFixed(3)});
  if (present <= 0.0) discard;

  // Jitter inside the middle of the cell so a star is never clipped by the cell it is looked up in.
  vec3 jitter = vec3(hash(cell + 1.7), hash(cell + 3.3), hash(cell + 5.9)) * 0.6 + 0.2;
  // Compare directions, not points in the grid: the cell is a cube and the star sits anywhere in
  // it, so its distance from the shell the fragment lies on says nothing about where it is on
  // screen. The chord between two unit vectors is the angle between them for angles this small.
  float angle = length(normalize(cell + jitter) - direction);
  float radius = (u_fov / u_resolution.y) * ${STAR_RADIUS_PX.toFixed(2)};
  float star = smoothstep(radius, 0.0, angle);
  float brightness = 0.3 + 0.7 * pow(hash(cell + 11.3), 2.0);

  float alpha = star * brightness * strength;
  if (alpha <= 0.0) discard;
  // MapLibre blends premultiplied alpha.
  gl_FragColor = vec4(vec3(1.0, 0.98, 0.94) * alpha, alpha);
}
`;

/** Invert a 4×4 column-major matrix. Returns null for a singular matrix. */
export function invert4x4(m: ArrayLike<number>): Float32Array | null {
  const a00 = m[0]!, a01 = m[1]!, a02 = m[2]!, a03 = m[3]!;
  const a10 = m[4]!, a11 = m[5]!, a12 = m[6]!, a13 = m[7]!;
  const a20 = m[8]!, a21 = m[9]!, a22 = m[10]!, a23 = m[11]!;
  const a30 = m[12]!, a31 = m[13]!, a32 = m[14]!, a33 = m[15]!;

  const b00 = a00 * a11 - a01 * a10;
  const b01 = a00 * a12 - a02 * a10;
  const b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11;
  const b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30;
  const b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31;
  const b10 = a21 * a33 - a23 * a31;
  const b11 = a22 * a33 - a23 * a32;

  const det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) return null;
  const d = 1 / det;

  return new Float32Array([
    (a11 * b11 - a12 * b10 + a13 * b09) * d,
    (a02 * b10 - a01 * b11 - a03 * b09) * d,
    (a31 * b05 - a32 * b04 + a33 * b03) * d,
    (a22 * b04 - a21 * b05 - a23 * b03) * d,
    (a12 * b08 - a10 * b11 - a13 * b07) * d,
    (a00 * b11 - a02 * b08 + a03 * b07) * d,
    (a32 * b02 - a30 * b05 - a33 * b01) * d,
    (a20 * b05 - a22 * b02 + a23 * b01) * d,
    (a10 * b10 - a11 * b08 + a13 * b06) * d,
    (a01 * b08 - a00 * b10 - a03 * b06) * d,
    (a30 * b04 - a31 * b02 + a33 * b00) * d,
    (a21 * b02 - a20 * b04 - a23 * b00) * d,
    (a11 * b07 - a10 * b09 - a12 * b06) * d,
    (a00 * b09 - a01 * b07 + a02 * b06) * d,
    (a31 * b01 - a30 * b03 - a32 * b00) * d,
    (a20 * b03 - a21 * b01 + a22 * b00) * d,
  ]);
}

/** The slice of MapLibre's custom-layer render arguments the starfield reads. */
export interface StarfieldRenderInput {
  fov: number;
  defaultProjectionData: {
    mainMatrix: ArrayLike<number>;
    fallbackMatrix: ArrayLike<number>;
    projectionTransition: number;
  };
}

export interface StarfieldLayer {
  id: string;
  type: "custom";
  renderingMode: "2d";
  /** 0 hides the stars; presets publish the value as `metadata['sphyra:presets'][preset].stars`. */
  intensity: number;
  onAdd(map: unknown, gl: WebGLRenderingContext): void;
  onRemove(map: unknown, gl: WebGLRenderingContext): void;
  render(gl: WebGLRenderingContext, args: StarfieldRenderInput): void;
}

/** The slice of the map the starfield needs; MapLibre's Map satisfies it. */
export interface StarfieldHost {
  getLayer(id: string): unknown;
  addLayer?(layer: unknown, beforeId?: string): void;
  getStyle?(): { layers?: { id: string }[] } | undefined | null;
}

/**
 * Add the starfield (behind every map layer) if it is missing and set its strength. Called on every
 * preset switch, so a map that starts in daylight still gets stars when it turns to night. The
 * layer is added even at intensity 0: space around the globe is starry at every hour, and the
 * layer skips its own draw when there is neither a night sky nor a globe on screen.
 */
export function ensureStarfieldOnMap(map: StarfieldHost, intensity: number): void {
  const existing = map.getLayer(STARFIELD_LAYER_ID) as { implementation?: StarfieldLayer } | undefined;
  if (existing) {
    // MapLibre keeps the object we handed it; the next frame reads the new intensity.
    if (existing.implementation) existing.implementation.intensity = intensity;
    return;
  }
  if (typeof map.addLayer !== "function") return;
  const first = map.getStyle?.()?.layers?.[0]?.id;
  map.addLayer(createStarfieldLayer(intensity), first);
}

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return shader;
}

/**
 * Build the starfield layer. `intensity` can be changed at any time (preset switches do), and the
 * layer draws nothing while it is 0 — daylight costs one early return per frame.
 */
export function createStarfieldLayer(intensity = 0): StarfieldLayer {
  let program: WebGLProgram | null = null;
  let buffer: WebGLBuffer | null = null;
  let position = -1;
  let uniforms: Record<string, WebGLUniformLocation | null> = {};

  return {
    id: STARFIELD_LAYER_ID,
    type: "custom",
    // "3d" would hand us MapLibre's 3D depth range, which sits in front of every map layer.
    renderingMode: "2d",
    intensity,

    onAdd(_map: unknown, gl: WebGLRenderingContext): void {
      const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SOURCE);
      const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SOURCE);
      if (!vertex || !fragment) return;
      program = gl.createProgram();
      if (!program) return;
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.linkProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      position = gl.getAttribLocation(program, "a_pos");
      for (const name of [
        "u_inv_globe",
        "u_inv_flat",
        "u_transition",
        "u_resolution",
        "u_fov",
        "u_intensity",
      ]) {
        uniforms[name] = gl.getUniformLocation(program, name);
      }
      buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      // One oversized triangle covers the viewport with no wasted diagonal.
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    },

    onRemove(_map: unknown, gl: WebGLRenderingContext): void {
      if (program) gl.deleteProgram(program);
      if (buffer) gl.deleteBuffer(buffer);
      program = null;
      buffer = null;
      uniforms = {};
    },

    render(gl: WebGLRenderingContext, args: StarfieldRenderInput): void {
      if (!program || !buffer) return;
      const projection = args.defaultProjectionData;
      // Daylight over a city: no sky stars and no globe to put stars around, so skip the pass.
      if (this.intensity <= 0 && projection.projectionTransition <= 0) return;
      const invGlobe = invert4x4(projection.mainMatrix);
      const invFlat = invert4x4(projection.fallbackMatrix);
      if (!invGlobe || !invFlat) return;

      gl.useProgram(program);
      gl.uniformMatrix4fv(uniforms["u_inv_globe"]!, false, invGlobe);
      gl.uniformMatrix4fv(uniforms["u_inv_flat"]!, false, invFlat);
      gl.uniform1f(uniforms["u_transition"]!, projection.projectionTransition);
      gl.uniform2f(uniforms["u_resolution"]!, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.uniform1f(uniforms["u_fov"]!, args.fov);
      gl.uniform1f(uniforms["u_intensity"]!, this.intensity);

      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
  };
}
