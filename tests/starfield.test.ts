import { describe, expect, it } from "vitest";
import {
  STARFIELD_LAYER_ID,
  createStarfieldLayer,
  ensureStarfieldOnMap,
  invert4x4,
  type StarfieldHost,
  type StarfieldLayer,
} from "../src/map/starfield";

// The starfield is a custom WebGL layer, so most of it can only be judged in a render (the parity
// harness does that). What is testable here is the part that silently goes wrong: the matrix
// inverse the sky mask depends on, and the layer's lifecycle on the map.

function multiply(a: ArrayLike<number>, b: ArrayLike<number>): number[] {
  const out: number[] = [];
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) sum += a[k * 4 + row]! * b[column * 4 + k]!;
      out[column * 4 + row] = sum;
    }
  }
  return out;
}

describe("invert4x4", () => {
  it("inverts a perspective-like matrix (product is the identity)", () => {
    const matrix = [
      1.7, 0.2, 0, 0,
      -0.3, 1.1, 0.4, 0.5,
      0.1, -0.6, -1.002, -1,
      12, -34, 56.7, 1,
    ];
    const inverse = invert4x4(matrix);
    expect(inverse).not.toBeNull();
    const product = multiply(matrix, inverse!);
    for (let i = 0; i < 16; i += 1) {
      expect(product[i]!).toBeCloseTo(i % 5 === 0 ? 1 : 0, 4);
    }
  });

  it("returns null for a singular matrix instead of NaN uniforms", () => {
    expect(invert4x4(new Array(16).fill(0))).toBeNull();
  });
});

function fakeHost(layers: string[]): StarfieldHost & { added: { layer: unknown; before?: string }[] } {
  const present = new Map<string, { implementation?: StarfieldLayer }>();
  const added: { layer: unknown; before?: string }[] = [];
  return {
    added,
    getLayer: (id: string) => present.get(id),
    addLayer(layer: unknown, beforeId?: string) {
      added.push({ layer, before: beforeId });
      present.set((layer as StarfieldLayer).id, { implementation: layer as StarfieldLayer });
    },
    getStyle: () => ({ layers: layers.map((id) => ({ id })) }),
  };
}

describe("ensureStarfieldOnMap", () => {
  it("adds the stars behind every map layer", () => {
    const host = fakeHost(["background", "water", "buildings-3d"]);
    ensureStarfieldOnMap(host, 1);
    expect(host.added).toHaveLength(1);
    expect((host.added[0]!.layer as StarfieldLayer).id).toBe(STARFIELD_LAYER_ID);
    expect(host.added[0]!.before).toBe("background");
  });

  it("still adds the layer in daylight, because space around the globe is starry at any hour", () => {
    const host = fakeHost(["background"]);
    ensureStarfieldOnMap(host, 0);
    expect(host.added).toHaveLength(1);
    expect((host.added[0]!.layer as StarfieldLayer).intensity).toBe(0);
  });

  it("retunes the layer it already added instead of adding a second one", () => {
    const host = fakeHost(["background"]);
    ensureStarfieldOnMap(host, 1);
    ensureStarfieldOnMap(host, 0.35);
    expect(host.added).toHaveLength(1);
    expect((host.added[0]!.layer as StarfieldLayer).intensity).toBe(0.35);
  });
});

describe("the layer itself", () => {
  it("is a 2d custom layer — 3d would put it in front of the map", () => {
    const layer = createStarfieldLayer(1);
    expect(layer.type).toBe("custom");
    expect(layer.renderingMode).toBe("2d");
  });

  it("skips the draw in daylight over a city — no night sky and no globe to put stars around", () => {
    const layer = createStarfieldLayer(0);
    const calls: string[] = [];
    const gl = new Proxy(
      {},
      {
        get: (_t, prop) => {
          calls.push(String(prop));
          return () => undefined;
        },
      },
    ) as unknown as WebGLRenderingContext;
    layer.render(gl, {
      fov: 0.64,
      defaultProjectionData: {
        mainMatrix: new Array(16).fill(0),
        fallbackMatrix: new Array(16).fill(0),
        projectionTransition: 0,
      },
    });
    expect(calls).toEqual([]);
  });
});
