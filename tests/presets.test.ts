import { describe, expect, it } from "vitest";
import {
  apply3dGroundDepth,
  apply3dGroundDepthToMap,
  applyModeToMap,
  applyPresetToMap,
  type MapLibreLike,
} from "../src/map/presets";
import type { SphyraStyle } from "../src/types";

describe("3D ground-depth contract", () => {
  it("draws the POI layer above buildings so a building never covers the labels in front of it", () => {
    const style = {
      version: 8,
      layers: [
        { id: "buildings-3d", paint: { "fill-extrusion-opacity": 0.8 } },
        { id: "infrastructure-line" },
        { id: "pois" },
        { id: "roads-label", layout: {} },
        { id: "places-label" },
      ],
    };

    apply3dGroundDepth(style);

    const ids = style.layers.map((layer) => layer.id);
    expect(ids.indexOf("roads-label")).toBeLessThan(ids.indexOf("buildings-3d"));
    expect(ids.indexOf("pois")).toBeGreaterThan(ids.indexOf("buildings-3d"));
    // Poles and power lines are ground ink: above the extrusions they speckled roofs.
    expect(ids.indexOf("infrastructure-line")).toBeLessThan(ids.indexOf("buildings-3d"));
  });

  // API 11-023 facade stack: two ground shadows · walls · roof cap, drawn together, POIs straight after.
  const FACADE = ["buildings-ao", "buildings-ao-contact", "buildings-3d", "buildings-3d-roof"];

  it("moves the whole facade stack together, above the ground stack and below the labels", () => {
    const style = {
      version: 8,
      layers: [
        { id: "pois" },
        { id: "buildings-ao" },
        { id: "buildings-ao-contact" },
        { id: "buildings-3d", paint: {} },
        { id: "buildings-3d-roof" },
        { id: "street-furniture-circle" },
        { id: "infrastructure-point" },
        { id: "housenumbers-label" },
        { id: "roads-line" },
        { id: "roads-label", layout: {} },
        { id: "places-label" },
      ],
    };

    apply3dGroundDepth(style);

    const ids = style.layers.map((layer) => layer.id);
    const start = ids.indexOf("buildings-ao");
    expect(ids.slice(start, start + 5)).toEqual([...FACADE, "pois"]);
    for (const ground of ["roads-line", "roads-label", "street-furniture-circle", "infrastructure-point"]) {
      expect(ids.indexOf(ground), ground).toBeLessThan(start);
    }
    expect(ids.indexOf("housenumbers-label")).toBeGreaterThan(start + 3);
    expect(ids.indexOf("places-label")).toBeGreaterThan(start + 3);
  });

  it("reorders a live map the same way as a fresh style", () => {
    let order = [
      "roads-line",
      "pois",
      "buildings-ao",
      "buildings-ao-contact",
      "buildings-3d",
      "buildings-3d-roof",
      "street-furniture-circle",
      "housenumbers-label",
    ];
    const map = {
      getLayer: (id: string) => (order.includes(id) ? { id } : undefined),
      setLight: () => undefined,
      setPaintProperty: () => undefined,
      setLayoutProperty: () => undefined,
      setTerrain: () => undefined,
      easeTo: () => undefined,
      moveLayer: (id: string, beforeId?: string) => {
        order = order.filter((entry) => entry !== id);
        const index = beforeId ? order.indexOf(beforeId) : order.length;
        order.splice(index < 0 ? order.length : index, 0, id);
      },
      getStyle: () => ({ layers: order.map((id) => ({ id })) }),
    };

    apply3dGroundDepthToMap(map);

    const start = order.indexOf("buildings-ao");
    expect(order.slice(start, start + 5)).toEqual([...FACADE, "pois"]);
    expect(order.indexOf("street-furniture-circle")).toBeLessThan(start);
    expect(order.indexOf("housenumbers-label")).toBeGreaterThan(start + 3);
  });
});

const PRESETS = {
  day: {
    light: { anchor: "map" as const, color: "#ffffff", intensity: 0.82 },
    sky: { "sky-color": "#9acdff", "horizon-color": "#eef4fa", "fog-color": "#eef4fa", "fog-ground-blend": 0.5, "horizon-fog-blend": 0.3, "sky-horizon-blend": 0.6, "atmosphere-blend": 1 },
    stars: 0,
    layers: {
      background: { "background-color": "#f5f3ef" },
      "buildings-3d": { "fill-extrusion-color": "#e8e5e0", "fill-extrusion-opacity": 1 },
      pois: { "text-color": "#565c68" },
    },
  },
  night: {
    light: { anchor: "map" as const, color: "#b8c8e0", intensity: 0.4 },
    sky: { "sky-color": "#092b51", "horizon-color": "#22304a", "fog-color": "#262b3d", "fog-ground-blend": 0.6, "horizon-fog-blend": 0.4, "sky-horizon-blend": 0.7, "atmosphere-blend": 1 },
    stars: 1,
    layers: {
      background: { "background-color": "#101724" },
      "buildings-3d": { "fill-extrusion-color": "#2c3444", "fill-extrusion-opacity": 1 },
      pois: { "text-color": "#d7dbe5" },
    },
  },
};

function fakeStyle(baked: "day" | "night"): SphyraStyle {
  const paint = PRESETS[baked].layers;
  return {
    version: 8,
    light: { ...PRESETS[baked].light },
    sky: { ...PRESETS[baked].sky },
    layers: [
      { id: "background", paint: { ...paint.background } },
      { id: "buildings-ao", layout: { visibility: "visible" }, paint: {} },
      { id: "buildings-fill", layout: { visibility: "none" }, paint: {} },
      { id: "buildings-outline", layout: { visibility: "none" }, paint: {} },
      { id: "buildings-3d", layout: { visibility: "visible" }, paint: { ...paint["buildings-3d"] } },
      { id: "pois", paint: { ...paint.pois } },
      { id: "terrain-hillshade", layout: { visibility: "visible" }, paint: {} },
      { id: "places-label" },
    ],
    metadata: {
      "sphyra:presets": PRESETS,
      "sphyra:modes": {
        "2d": { hiddenLayers: ["buildings-3d", "terrain-hillshade", "buildings-ao"], terrain: null, pitch: 0 },
        "3d": {
          hiddenLayers: ["buildings-fill", "buildings-outline", "buildings-outline"],
          terrain: { source: "sphyra_terrain", exaggeration: 1 },
          pitch: 60,
        },
      },
    },
  } as SphyraStyle;
}

function recordingMap(style: SphyraStyle) {
  const layers = (style.layers ?? []) as { id: string; paint?: Record<string, unknown>; layout?: Record<string, unknown> }[];
  const byId = new Map(layers.map((layer) => [layer.id, layer]));
  let light: unknown = style.light;
  let sky: unknown = style.sky;
  let terrain: unknown;
  let pitch: number | undefined;
  const added: unknown[] = [];
  const map: MapLibreLike & { snapshot(): SphyraStyle; added: unknown[] } = {
    added,
    getLayer(id) {
      return byId.get(id);
    },
    setLight(next) {
      light = next;
    },
    setSky(next) {
      sky = next;
    },
    addLayer(layer) {
      added.push(layer);
    },
    getStyle() {
      return { layers: layers.map((layer) => ({ id: layer.id })) };
    },
    setPaintProperty(layerId, name, value) {
      const layer = byId.get(layerId);
      if (!layer) return;
      layer.paint = { ...(layer.paint ?? {}), [name]: value };
    },
    setLayoutProperty(layerId, name, value) {
      const layer = byId.get(layerId);
      if (!layer) return;
      layer.layout = { ...(layer.layout ?? {}), [name]: value };
    },
    setTerrain(next) {
      terrain = next;
    },
    easeTo(opts) {
      pitch = opts.pitch;
    },
    snapshot() {
      return {
        ...style,
        light,
        sky,
        terrain,
        pitch,
        layers: layers.map((layer) => ({
          id: layer.id,
          paint: layer.paint ? { ...layer.paint } : undefined,
          layout: layer.layout ? { ...layer.layout } : undefined,
        })),
      } as SphyraStyle;
    },
  };
  return map;
}

function themedPaint(style: SphyraStyle) {
  const layers = (style.layers ?? []) as { id: string; paint?: Record<string, unknown> }[];
  return {
    light: style.light,
    sky: style.sky,
    background: layers.find((layer) => layer.id === "background")?.paint,
    buildings3d: layers.find((layer) => layer.id === "buildings-3d")?.paint,
    pois: layers.find((layer) => layer.id === "pois")?.paint,
  };
}

describe("applyPresetToMap — runtime switch equals a fresh bake", () => {
  it("day → night matches a style that was built as night", () => {
    const day = fakeStyle("day");
    const nightFresh = fakeStyle("night");
    const map = recordingMap(day);

    applyPresetToMap(map, day, "night");

    expect(themedPaint(map.snapshot())).toEqual(themedPaint(nightFresh));
  });

  it("day → night → day returns to the original day bake", () => {
    const day = fakeStyle("day");
    const original = themedPaint(structuredClone(day));
    const map = recordingMap(day);

    applyPresetToMap(map, day, "night");
    applyPresetToMap(map, day, "day");

    expect(themedPaint(map.snapshot())).toEqual(original);
  });
});

describe("applyModeToMap — 2D/3D toggle", () => {
  it("hides extrusions in 2D and restores them in 3D", () => {
    const style = fakeStyle("day");
    const map = recordingMap(style);

    applyModeToMap(map, style, "2d");
    expect(map.getLayer("buildings-3d")).toMatchObject({ layout: { visibility: "none" } });
    expect(map.getLayer("buildings-outline")).toMatchObject({ layout: { visibility: "visible" } });

    applyModeToMap(map, style, "3d");
    expect(map.getLayer("buildings-3d")).toMatchObject({ layout: { visibility: "visible" } });
    expect(map.getLayer("buildings-outline")).toMatchObject({ layout: { visibility: "none" } });
  });
});
