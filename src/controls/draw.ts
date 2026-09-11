import type maplibregl from "maplibre-gl";
import type { ControlPosition } from "./builtins";

export type DrawGeometryType = "point" | "line" | "polygon";

/** Minimal shape of the draw plugin instance this wrapper uses. */
export interface MapboxDrawLike {
  getAll(): GeoJSON.FeatureCollection;
  deleteAll(): unknown;
  changeMode(mode: string, opts?: unknown): unknown;
  onAdd(map: maplibregl.Map): HTMLElement;
  onRemove(map: maplibregl.Map): void;
}
export interface MapboxDrawCtor {
  new (options?: Record<string, unknown>): MapboxDrawLike;
}

export interface CreateDrawControlOptions {
  /** The draw constructor from "@mapbox/mapbox-gl-draw" (optional peer dep — caller supplies it). */
  DrawCtor: MapboxDrawCtor;
  /** Forwarded to the draw constructor (e.g. { displayControlsDefault, controls, styles }). */
  drawOptions?: Record<string, unknown>;
  position?: ControlPosition; // default "top-left"
  /** Fired with the full FeatureCollection on every create / update / delete. */
  onChange?: (features: GeoJSON.FeatureCollection) => void;
}

export interface SphyraDrawHandle {
  draw: MapboxDrawLike;
  getFeatures(): GeoJSON.FeatureCollection;
  /** Switch the draw mode to start a new point / line / polygon. */
  startDrawing(type: DrawGeometryType): void;
  deleteAll(): void;
  remove(): void;
}

const DRAW_MODE: Record<DrawGeometryType, string> = {
  point: "draw_point",
  line: "draw_line_string",
  polygon: "draw_polygon",
};

/**
 * Wrap a draw plugin instance onto the map: adds the control, normalizes create/update/delete
 * into a single onChange(FeatureCollection), and exposes mode helpers + GeoJSON readout. No
 * network, no client.
 */
export function createDrawControl(
  map: maplibregl.Map,
  options: CreateDrawControlOptions,
): SphyraDrawHandle {
  const draw = new options.DrawCtor(options.drawOptions);
  map.addControl(draw as unknown as maplibregl.IControl, options.position ?? "top-left");

  const emit = (): void => options.onChange?.(draw.getAll());
  if (options.onChange) {
    map.on("draw.create", emit);
    map.on("draw.update", emit);
    map.on("draw.delete", emit);
  }

  return {
    draw,
    getFeatures() {
      return draw.getAll();
    },
    startDrawing(type) {
      draw.changeMode(DRAW_MODE[type]);
    },
    deleteAll() {
      draw.deleteAll();
    },
    remove() {
      if (options.onChange) {
        map.off("draw.create", emit);
        map.off("draw.update", emit);
        map.off("draw.delete", emit);
      }
      map.removeControl(draw as unknown as maplibregl.IControl);
    },
  };
}
