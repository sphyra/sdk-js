import type { StyleMode, StylePreset, SphyraPresetDef, SphyraModeDef, SphyraStyle } from "../types";
import { ensureStarfieldOnMap, type StarfieldHost } from "./starfield.js";

export const STYLE_PRESETS: readonly StylePreset[] = ["dawn", "day", "dusk", "night"];
export const STYLE_MODES: readonly StyleMode[] = ["2d", "3d"];
export const DEFAULT_PRESET: StylePreset = "day";
export const DEFAULT_MODE: StyleMode = "3d";

export function isStylePreset(v: unknown): v is StylePreset {
  return typeof v === "string" && (STYLE_PRESETS as readonly string[]).includes(v);
}
export function isStyleMode(v: unknown): v is StyleMode {
  return typeof v === "string" && (STYLE_MODES as readonly string[]).includes(v);
}

function metadata(style: SphyraStyle): Record<string, unknown> {
  const m = style["metadata"];
  return m && typeof m === "object" ? (m as Record<string, unknown>) : {};
}

/** Read metadata["sphyra:presets"] (null if the style lacks the 10-012 contract). */
export function readPresetTable(style: SphyraStyle): Record<StylePreset, SphyraPresetDef> | null {
  const t = metadata(style)["sphyra:presets"];
  return t && typeof t === "object" ? (t as Record<StylePreset, SphyraPresetDef>) : null;
}

/** Read metadata["sphyra:modes"] (null if the style lacks the 10-012 contract). */
export function readModeTable(style: SphyraStyle): Record<StyleMode, SphyraModeDef> | null {
  const t = metadata(style)["sphyra:modes"];
  return t && typeof t === "object" ? (t as Record<StyleMode, SphyraModeDef>) : null;
}

/** Union of every layer that any mode hides — the runtime-toggleable set. Empty if no contract. */
export function toggleableLayers(style: SphyraStyle): string[] {
  const modes = readModeTable(style);
  if (!modes) return [];
  const set = new Set<string>();
  for (const def of Object.values(modes)) for (const id of def.hiddenLayers) set.add(id);
  return [...set];
}

/** Camera pitch for a mode from the table; falls back to 45 for 3d / 0 for 2d. */
export function pitchForMode(style: SphyraStyle, mode: StyleMode): number {
  return readModeTable(style)?.[mode]?.pitch ?? (mode === "3d" ? 45 : 0);
}

export interface MapLibreLike {
  getLayer(id: string): unknown;
  setLight(light: unknown): void;
  setSky?(sky: unknown): void;
  addLayer?(layer: unknown, beforeId?: string): void;
  getStyle?(): { layers?: { id: string }[] } | undefined | null;
  setPaintProperty(layerId: string, name: string, value: unknown): void;
  setLayoutProperty(layerId: string, name: string, value: unknown): void;
  setTerrain(terrain: unknown): void;
  easeTo(opts: { pitch?: number }): void;
  moveLayer?(id: string, beforeId?: string): void;
}

/** Ground road stack — must render before fill-extrusion so buildings occlude roads/labels in 3D. */
export const ROAD_GROUND_LAYER_IDS = [
  "transit-line",
  "roads-tunnel",
  "roads-casing",
  "roads-rim",
  "roads-line",
  "roads-bridge",
  "roads-lanes",
  "roads-crosswalk-base",
  "roads-crosswalk",
  "roads-oneway",
  // Poles, lamps and power lines are ground ink too — above the extrusions they speckled roofs.
  "infrastructure-line",
  "infrastructure-point",
  "street-furniture-circle",
  "roads-label",
] as const;

/** Drawn straight after the building stack so buildings never cover POI labels (API 11-023). */
export const LAYERS_ON_BUILDINGS_3D = ["pois"] as const;

/** Ground shadows · walls · roof cap (API 11-023), always drawn together in this order. */
export const BUILDING_FACADE_LAYERS = [
  "buildings-ao",
  "buildings-ao-contact",
  "buildings-3d",
  "buildings-3d-roof",
] as const;

/** Address numbers and place names sit above extrusions. */
export const LAYERS_ABOVE_BUILDINGS_3D = [
  "natural-peak",
  "buildings-housenumber-label",
  "housenumbers-label",
  "landuse-label",
  "places-label",
  "water-label",
] as const;

function extractLayer(
  layers: { id: string; layout?: Record<string, unknown> }[],
  id: string,
): { id: string; layout?: Record<string, unknown> } | null {
  const idx = layers.findIndex((l) => l.id === id);
  if (idx < 0) return null;
  return layers.splice(idx, 1)[0] ?? null;
}

/** Normalize: … → road/POI ground stack → facade stack → housenumbers / place labels. */
export function apply3dGroundDepth(style: SphyraStyle): void {
  const layers = (style["layers"] as { id: string; layout?: Record<string, unknown> }[] | undefined) ?? [];
  if (!layers.some((l) => l.id === "buildings-3d")) return;
  const facade = BUILDING_FACADE_LAYERS.map((id) => extractLayer(layers, id)).filter(
    (layer): layer is { id: string; layout?: Record<string, unknown> } => layer !== null,
  );
  const buildings3d = facade.find((l) => l.id === "buildings-3d")!;

  const roadLayers: { id: string; layout?: Record<string, unknown> }[] = [];
  for (const id of ROAD_GROUND_LAYER_IDS) {
    const layer = extractLayer(layers, id);
    if (layer) roadLayers.push(layer);
  }

  const onBuildings = LAYERS_ON_BUILDINGS_3D.map((id) => extractLayer(layers, id)).filter(
    (layer): layer is { id: string; layout?: Record<string, unknown> } => layer !== null,
  );

  const roadsLabel = roadLayers.find((l) => l.id === "roads-label");
  if (roadsLabel?.layout) {
    roadsLabel.layout = {
      ...roadsLabel.layout,
      "text-pitch-alignment": "map",
      "text-rotation-alignment": "map",
    };
  }

  let insertIdx = layers.findIndex((l) =>
    (LAYERS_ABOVE_BUILDINGS_3D as readonly string[]).includes(l.id),
  );
  if (insertIdx < 0) insertIdx = layers.length;

  layers.splice(insertIdx, 0, ...roadLayers, ...facade, ...onBuildings);
  enforceOpaqueBuildings3d(buildings3d);
}

function enforceOpaqueBuildings3d(layer: { id: string; paint?: Record<string, unknown> }): void {
  layer.paint = { ...(layer.paint ?? {}), "fill-extrusion-opacity": 1 };
}

function enforceOpaqueBuildings3dOnMap(map: MapLibreLike): void {
  if (map.getLayer("buildings-3d")) {
    map.setPaintProperty("buildings-3d", "fill-extrusion-opacity", 1);
  }
}

export function apply3dGroundDepthToMap(map: MapLibreLike): void {
  if (!map.getLayer("buildings-3d") || !map.moveLayer) return;
  const moveLayer = map.moveLayer.bind(map);

  enforceOpaqueBuildings3dOnMap(map);

  if (map.getLayer("roads-label")) {
    map.setLayoutProperty("roads-label", "text-pitch-alignment", "map");
    map.setLayoutProperty("roads-label", "text-rotation-alignment", "map");
  }

  const ids = () => map.getStyle?.()?.layers?.map((l) => l.id) ?? [];
  const anchor = LAYERS_ABOVE_BUILDINGS_3D.find((id) => ids().includes(id));
  if (!anchor) return;

  // Facade stack directly under the first label layer, in order.
  for (const id of BUILDING_FACADE_LAYERS) {
    if (map.getLayer(id)) moveLayer(id, anchor);
  }

  for (const id of LAYERS_ON_BUILDINGS_3D) {
    if (map.getLayer(id)) moveLayer(id, anchor);
  }

  // Any ground layer that ended up above the stack goes back under it.
  const bottom = BUILDING_FACADE_LAYERS.find((id) => map.getLayer(id))!;
  for (const groundId of ROAD_GROUND_LAYER_IDS) {
    const current = ids();
    if (current.includes(groundId) && current.indexOf(groundId) > current.indexOf(bottom)) {
      moveLayer(groundId, bottom);
    }
  }
}

export interface ApplyPresetOptions {
  /** Layer ids to skip — e.g. 2D tree canopies while the Three.js layer is active. */
  skipLayers?: readonly string[];
}

/** Repaint to `preset` at runtime (no re-fetch): setLight + per-layer setPaintProperty. */
export function applyPresetToMap(
  map: MapLibreLike,
  style: SphyraStyle,
  preset: StylePreset,
  opts?: ApplyPresetOptions,
): void {
  const def = readPresetTable(style)?.[preset];
  if (!def) return;
  const skip = new Set(opts?.skipLayers ?? []);
  map.setLight(def.light);
  // Renderers older than maplibre-gl 5 have no sky; the rest of the preset still applies.
  if (typeof map.setSky === "function") map.setSky(def.sky ?? null);
  ensureStarfieldOnMap(map as StarfieldHost, def.stars ?? 0);
  for (const [id, paint] of Object.entries(def.layers)) {
    if (skip.has(id) || !map.getLayer(id)) continue;
    for (const [prop, val] of Object.entries(paint)) map.setPaintProperty(id, prop, val);
  }
  enforceOpaqueBuildings3dOnMap(map);
}

/** Switch to `mode` at runtime (no re-fetch): layer visibility + terrain + camera pitch. */
export function applyModeToMap(map: MapLibreLike, style: SphyraStyle, mode: StyleMode): void {
  const def = readModeTable(style)?.[mode];
  if (!def) return;
  const hidden = new Set(def.hiddenLayers);
  for (const id of toggleableLayers(style)) {
    if (!map.getLayer(id)) continue;
    map.setLayoutProperty(id, "visibility", hidden.has(id) ? "none" : "visible");
  }
  map.setTerrain(def.terrain);
  map.easeTo({ pitch: def.pitch });
  if (mode === "3d") apply3dGroundDepthToMap(map);
}
