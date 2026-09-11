import maplibregl from "maplibre-gl";
import type { SphyraClient } from "../SphyraClient";
import type { StyleMode, StylePreset, SphyraStyle } from "../types";
import {
  DEFAULT_MODE,
  DEFAULT_PRESET,
  applyModeToMap,
  applyPresetToMap,
  apply3dGroundDepth,
  pitchForMode,
} from "./presets";
import { addSphyraLogoControl } from "./sphyraLogoControl.js";

export interface CreateSphyraMapOptions {
  client: SphyraClient;
  preset?: StylePreset; // default "day"
  mode?: StyleMode; // default "3d"
  center?: [number, number]; // [lon, lat]; default the style's center or [44.5, 40.18] (Yerevan)
  zoom?: number; // default 12
  bearing?: number;
  pitch?: number; // default: pitch from the mode table
  /**
   * Rewrite request URLs before the SDK's own signing transform runs (composed, not replaced).
   * Use it to send the API's absolute signed URLs same-origin — e.g. a browser demo behind a
   * dev proxy rewrites them to `window.location.origin` so they avoid CORS. Return `undefined`
   * to leave a URL unchanged. The HMAC signs path+query, so changing only the host keeps signed
   * URLs valid.
   */
  transformRequest?: maplibregl.RequestTransformFunction;
  /** Corner logo URL; defaults to the bundled Sphyra mark when omitted. */
  logoUrl?: string;
  /** Corner logo height in px. Default 20. */
  logoSize?: number;
  onLoad?: (map: maplibregl.Map) => void;
  onError?: (err: unknown) => void;
}

export interface SphyraMapHandle {
  map: maplibregl.Map;
  setPreset(preset: StylePreset): void;
  setMode(mode: StyleMode): void;
  destroy(): void;
}

const YEREVAN: [number, number] = [44.5, 40.18];

/**
 * Build a configured maplibre-gl Map over the signed Sphyra style. Fetches the style once
 * (Bearer key via client), signs unsigned API sub-requests via transformRequest, applies the
 * requested preset/mode after `load`, and exposes runtime setPreset/setMode (no re-fetch).
 */
export async function createSphyraMap(
  container: HTMLElement | string,
  options: CreateSphyraMapOptions,
): Promise<SphyraMapHandle> {
  const { client } = options;
  const preset = options.preset ?? DEFAULT_PRESET;
  const mode = options.mode ?? DEFAULT_MODE;

  let style: SphyraStyle;
  try {
    style = await client.getMapStyle({ preset, mode });
  } catch (err) {
    options.onError?.(err);
    throw err;
  }
  apply3dGroundDepth(style);

  const base = client.baseUrl;
  const authHeaders = client.authHeaders();
  const userTransform = options.transformRequest;
  const transformRequest: maplibregl.RequestTransformFunction = (url, resourceType) => {
    // Let the consumer rewrite first (e.g. a same-origin proxy rewrite), then sign.
    const rewritten = userTransform?.(url, resourceType);
    const nextUrl = rewritten?.url ?? url;
    if (nextUrl.startsWith(base) && !nextUrl.includes("sig=")) {
      return { ...rewritten, url: nextUrl, headers: { ...rewritten?.headers, ...authHeaders } };
    }
    return rewritten ?? { url };
  };

  const map = new maplibregl.Map({
    container,
    style: style as maplibregl.StyleSpecification,
    center: options.center ?? YEREVAN,
    zoom: options.zoom ?? 12,
    bearing: options.bearing ?? 0,
    pitch: options.pitch ?? pitchForMode(style, mode),
    transformRequest,
    attributionControl: false,
    maplibreLogo: false,
  });

  addSphyraLogoControl(map, {
    logoUrl: options.logoUrl,
    size: options.logoSize,
  });

  let activePreset = preset;
  let activeMode = mode;

  let ready = false;
  const fireReady = (): void => {
    if (ready) return;
    ready = true;
    applyPresetToMap(map as unknown as Parameters<typeof applyPresetToMap>[0], style, activePreset);
    applyModeToMap(map as unknown as Parameters<typeof applyModeToMap>[0], style, activeMode);
    options.onLoad?.(map);
  };

  // Normal path: the map finished loading.
  map.on("load", fireReady);

  // Robust fallback: a raster-dem source (terrain / hillshade) viewed above its `maxzoom` keeps
  // overzoomed DEM tiles in MapLibre's "reloading" state indefinitely, so its source cache never
  // reaches loaded() and the map `load` event never fires. Once the style spec is parsed and every
  // NON-terrain source is loaded, the map is interactive and consumers can add layers/markers —
  // fire readiness then (terrain keeps settling in the background). No-op if `load` already fired.
  const nonTerrainSourceIds = Object.entries(
    (style as { sources?: Record<string, { type?: string }> }).sources ?? {},
  )
    .filter(([, src]) => src?.type !== "raster-dem")
    .map(([id]) => id);

  if (nonTerrainSourceIds.length > 0) {
    const checkData = (): void => {
      if (ready) return;
      let allLoaded: boolean;
      try {
        allLoaded = nonTerrainSourceIds.every((id) => map.isSourceLoaded(id));
      } catch {
        return; // style spec not parsed yet → isSourceLoaded throws
      }
      if (allLoaded) fireReady();
    };
    map.on("sourcedata", checkData);
  }

  map.on("error", (e) => options.onError?.(e.error ?? e));

  return {
    map,
    setPreset(next) {
      activePreset = next;
      applyPresetToMap(map as unknown as Parameters<typeof applyPresetToMap>[0], style, next);
      // Re-apply mode so flat footprints stay hidden in 3D after paint updates.
      applyModeToMap(map as unknown as Parameters<typeof applyModeToMap>[0], style, activeMode);
    },
    setMode(next) {
      activeMode = next;
      applyModeToMap(map as unknown as Parameters<typeof applyModeToMap>[0], style, next);
    },
    destroy() {
      map.remove();
    },
  };
}
