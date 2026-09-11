import type { StyleMode, StylePreset, SphyraPresetDef, SphyraModeDef, SphyraStyle } from "../types";

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
  setFog?(fog: unknown): void;
  setPaintProperty(layerId: string, name: string, value: unknown): void;
  setLayoutProperty(layerId: string, name: string, value: unknown): void;
  setTerrain(terrain: unknown): void;
  easeTo(opts: { pitch?: number }): void;
  moveLayer?(id: string, beforeId?: string): void;
}

/** Ground road stack — must render before fill-extrusion so buildings occlude roads/labels in 3D. */
export const ROAD_GROUND_LAYER_IDS = [
  "roads-casing",
  "roads-rim",
  "roads-line",
  "roads-lanes",
  "roads-crosswalk-base",
  "roads-crosswalk",
  "roads-oneway",
  "roads-label",
] as const;

/** POI badges, address numbers, and place names sit above extruded buildings. */
export const LAYERS_ABOVE_BUILDINGS_3D = [
  "pois-circle",
  "pois-icon",
  "pois-label",
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

/** Normalize: … → road stack → buildings-3d → POIs / housenumbers / place labels. */
export function apply3dGroundDepth(style: SphyraStyle): void {
  const layers = (style["layers"] as { id: string; layout?: Record<string, unknown> }[] | undefined) ?? [];
  const buildings3d = extractLayer(layers, "buildings-3d");
  if (!buildings3d) return;

  const roadLayers: { id: string; layout?: Record<string, unknown> }[] = [];
  for (const id of ROAD_GROUND_LAYER_IDS) {
    const layer = extractLayer(layers, id);
    if (layer) roadLayers.push(layer);
  }

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

  layers.splice(insertIdx, 0, ...roadLayers, buildings3d);
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

export function apply3dGroundDepthToMap(map: MapLibreLike & { getStyle?: () => { layers?: { id: string }[] } }): void {
  if (!map.getLayer("buildings-3d") || !map.moveLayer) return;

  enforceOpaqueBuildings3dOnMap(map);

  if (map.getLayer("roads-label")) {
    map.setLayoutProperty("roads-label", "text-pitch-alignment", "map");
    map.setLayoutProperty("roads-label", "text-rotation-alignment", "map");
  }

  const ids = map.getStyle?.()?.layers?.map((l) => l.id) ?? [];
  const anchor = LAYERS_ABOVE_BUILDINGS_3D.find((id) => ids.includes(id));
  if (!anchor) return;

  const bIdx = ids.indexOf("buildings-3d");
  const anchorIdx = ids.indexOf(anchor);
  if (bIdx < 0 || bIdx === anchorIdx - 1) return;

  map.moveLayer("buildings-3d", anchor);

  const refreshed = map.getStyle?.()?.layers?.map((l) => l.id) ?? [];
  const bIdx2 = refreshed.indexOf("buildings-3d");
  for (const roadId of ROAD_GROUND_LAYER_IDS) {
    if (!refreshed.includes(roadId)) continue;
    if (refreshed.indexOf(roadId) > bIdx2) {
      map.moveLayer(roadId, "buildings-3d");
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
  if (typeof map.setFog === "function") {
    map.setFog(def.fog ?? null);
  }
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
