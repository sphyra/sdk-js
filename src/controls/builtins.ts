import maplibregl from "maplibre-gl";

export type ControlPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export interface NavigationControlOptions {
  showCompass?: boolean; // default true
  showZoom?: boolean; // default true
  visualizePitch?: boolean; // default true
}
export interface GeolocateControlOptions {
  enableHighAccuracy?: boolean; // default true
  trackUserLocation?: boolean; // default true
  showUserLocation?: boolean; // default true
}
export interface ScaleControlOptions {
  maxWidth?: number; // px, default 100
  unit?: "metric" | "imperial" | "nautical"; // default "metric"
}

/** Add the maplibre-gl navigation control (zoom + compass + pitch). Returns it for later removeControl. */
export function addNavigationControl(
  map: maplibregl.Map,
  options: NavigationControlOptions = {},
  position: ControlPosition = "top-right",
): maplibregl.NavigationControl {
  const control = new maplibregl.NavigationControl({
    showCompass: options.showCompass ?? true,
    showZoom: options.showZoom ?? true,
    visualizePitch: options.visualizePitch ?? true,
  });
  map.addControl(control, position);
  return control;
}

/** Add the maplibre-gl geolocate control (user position + tracking). */
export function addGeolocateControl(
  map: maplibregl.Map,
  options: GeolocateControlOptions = {},
  position: ControlPosition = "top-right",
): maplibregl.GeolocateControl {
  const control = new maplibregl.GeolocateControl({
    positionOptions: { enableHighAccuracy: options.enableHighAccuracy ?? true },
    trackUserLocation: options.trackUserLocation ?? true,
    showUserLocation: options.showUserLocation ?? true,
  });
  map.addControl(control, position);
  return control;
}

/** Add the maplibre-gl scale control. */
export function addScaleControl(
  map: maplibregl.Map,
  options: ScaleControlOptions = {},
  position: ControlPosition = "bottom-left",
): maplibregl.ScaleControl {
  const control = new maplibregl.ScaleControl({
    maxWidth: options.maxWidth ?? 100,
    unit: options.unit ?? "metric",
  });
  map.addControl(control, position);
  return control;
}
