// Mirrors sphyra/api/app/Types/geocode.ts and tileConfig.ts.
// TODO: re-export from @sphyra/types once that shared package is published.

export type GeocodeLang = "hy" | "en" | "ru";

export interface ReverseGeocodeResult {
  displayName: string;
  city: string | null;
  district: string | null;
  street: string | null;
  country: string;
  lat: number;
  lon: number;
}

export interface GeocodeResult {
  displayName: string;
  lat: number;
  lon: number;
  boundingBox: [number, number, number, number];
  type: string;
}

export interface TileConfigResponse {
  tileUrlTemplate: string;
  styleUrl: string;
  expiresAt: number;
  attribution: string;
}

export type HealthStatus = "ok" | "degraded";

// Directions / turn-by-turn routing (S-1.0.0-10-002).
// Vendored byte-identically from sphyra/api/app/Types/directions.ts. Distances are
// METERS, durations are SECONDS. Keep sdk-js/src/types.ts and sdk-rn/src/types.ts in sync.

export type DirectionsProfile = "driving" | "walking" | "cycling";
export type DirectionsGeometry = "geojson" | "polyline";
export type DirectionsLang = "hy" | "en" | "ru";

export interface GeoJSONLineString {
  type: "LineString";
  coordinates: [number, number][]; // [lon, lat]
}

export interface DirectionsManeuver {
  type: number; // Valhalla maneuver type code
  instruction: string; // human-readable turn instruction
  location: [number, number]; // [lon, lat] where the maneuver occurs
}

export interface DirectionsStep {
  maneuver: DirectionsManeuver;
  name: string; // street name(s), joined with ", "
  distance: number; // meters
  duration: number; // seconds
}

export interface DirectionsLeg {
  distance: number; // meters
  duration: number; // seconds
  steps: DirectionsStep[]; // empty array when steps=false
}

export interface DirectionsRoute {
  geometry: GeoJSONLineString | string; // GeoJSON when geometries="geojson", else polyline6 string
  distance: number; // meters (whole route)
  duration: number; // seconds (whole route)
  legs: DirectionsLeg[];
}

export interface DirectionsWaypoint {
  location: [number, number]; // [lon, lat]
  name: string; // "" when Valhalla supplies none
}

export interface DirectionsResult {
  routes: DirectionsRoute[]; // primary route first, then alternates
  waypoints: DirectionsWaypoint[];
}

export interface DirectionsParams {
  waypoints: [number, number][]; // ordered [lon, lat], min 2
  profile?: DirectionsProfile; // default "driving"
  alternatives?: boolean; // default false
  steps?: boolean; // default true
  language?: DirectionsLang; // default "hy"
  geometries?: DirectionsGeometry; // default "geojson"
}

// Matrix / travel-time + distance matrix (S-1.0.0-10-003).
// Vendored byte-identically from sphyra/api/app/Types/matrix.ts. Distances are
// METERS, durations are SECONDS. A `null` cell = no route between that source/target
// pair (API semantics — distinct from 0). Keep sdk-js/src/types.ts and
// sdk-rn/src/types.ts in sync.

export type MatrixProfile = "driving" | "walking" | "cycling";
export type MatrixAnnotation = "duration" | "distance" | "both";

export interface MatrixResult {
  // [sourceIndex][targetIndex]. `null` = no route between that source/target pair (API semantics).
  durations: (number | null)[][]; // seconds; [] when annotations === "distance"
  distances: (number | null)[][]; // meters;  [] when annotations === "duration"
  sources: [number, number][]; // echoed input sources, [lon, lat]
  targets: [number, number][]; // echoed input targets, [lon, lat]
}

export interface MatrixParams {
  sources: [number, number][]; // ordered [lon, lat], 1..25
  targets: [number, number][]; // ordered [lon, lat], 1..25
  profile?: MatrixProfile; // default "driving"
  annotations?: MatrixAnnotation; // default "both"
}

// Isochrone / reachable-area contours (S-1.0.0-10-004).
// Vendored byte-identically from sphyra/api/app/Types/isochrone.ts. A `metric:"time"`
// feature's `contour` is MINUTES; a `metric:"distance"` feature's `contour` is METERS.
// Reuses the existing GeoJSONLineString (from the directions block). Keep
// sdk-js/src/types.ts and sdk-rn/src/types.ts in sync.

export type IsochroneProfile = "driving" | "walking" | "cycling";
export type IsochroneMetric = "time" | "distance";

export interface GeoJSONPolygon {
  type: "Polygon";
  coordinates: [number, number][][]; // rings of [lon, lat]
}

export interface IsochroneFeatureProperties {
  contour: number; // minutes when metric="time"; meters when metric="distance"
  metric: IsochroneMetric;
  color: string; // hex WITH leading '#'
  opacity: number; // fill/stroke opacity (Valhalla default 0.33)
  fill?: string; // polygon only — hex with '#'
  fillOpacity?: number; // polygon only
  stroke?: string; // line only — hex with '#'
  strokeWidth?: number; // line only
}

export interface IsochroneFeature {
  type: "Feature";
  properties: IsochroneFeatureProperties;
  geometry: GeoJSONPolygon | GeoJSONLineString; // Polygon when polygons=true, else LineString
}

export interface IsochroneResult {
  type: "FeatureCollection";
  features: IsochroneFeature[]; // one per contour, ascending contour order
}

export interface IsochroneParams {
  origin: [number, number]; // [lon, lat], required
  profile?: IsochroneProfile; // default "driving"
  contoursMinutes?: number[]; // minutes; at least one of minutes/meters required
  contoursMeters?: number[]; // meters
  contoursColors?: string[]; // hex without '#', length must match total contours
  polygons?: boolean; // default true
  denoise?: number; // 0..1
  generalize?: number; // meters
}

// Map Matching / snap a noisy GPS trace to the road network (S-1.0.0-10-005).
// Vendored byte-identically from sphyra/api/app/Types/mapMatching.ts. Distances are
// METERS, durations are SECONDS; `confidence` is 0..1. Reuses the existing
// GeoJSONLineString + DirectionsLeg (from the directions block). Keep
// sdk-js/src/types.ts and sdk-rn/src/types.ts in sync.

export type MapMatchProfile = "driving" | "walking" | "cycling";
export type MapMatchGeometry = "geojson" | "polyline";
export type MapMatchLang = "hy" | "en" | "ru";
export type MatchedPointType = "matched" | "interpolated" | "unmatched";

export interface MapMatchTracepoint {
  location: [number, number]; // [lon, lat] — the SNAPPED position
  name: string; // street name of the snapped edge ("" when none)
  matchingsIndex: number; // index of the matching this point belongs to (always 0 — single matching)
  waypointIndex: number; // index of this point in the input trace (0-based, input order)
  type: MatchedPointType; // matched | interpolated | unmatched
  distanceFromTrace: number; // meters — snap distance from the raw input point (1-decimal)
}

export interface MapMatchResult {
  geometry: GeoJSONLineString | string; // GeoJSON when geometries="geojson", else polyline6 string
  confidence: number; // 0..1 — derived match quality
  distance: number; // meters (whole matched route)
  duration: number; // seconds (whole matched route)
  tracepoints: MapMatchTracepoint[]; // one per input coordinate, input order
  legs: DirectionsLeg[]; // normalized; steps[] empty unless steps=true
}

export interface MapMatchParams {
  coordinates: [number, number][]; // ordered [lon, lat], min 2, max 100
  timestamps?: number[]; // unix seconds; if present, length MUST equal coordinates
  radiuses?: number[]; // per-point search radius (meters); if present, length MUST equal coordinates
  profile?: MapMatchProfile; // default "driving"
  tidy?: boolean; // default false — drop near-duplicate consecutive points before matching
  geometries?: MapMatchGeometry; // default "geojson"
  language?: MapMatchLang; // default "hy"
  steps?: boolean; // default false — include turn-by-turn steps in legs
}

// Optimization / optimal waypoint ordering (S-1.0.0-10-006).
// Vendored byte-identically from sphyra/api/app/Types/optimization.ts. Distances are
// METERS, durations are SECONDS. Reuses the existing DirectionsRoute (from the directions
// block) as the optimized trip type. `source`/`destination` "any" is accepted for the Optimization API
// parity but a documented v1 no-op (Valhalla fixes first/last). Keep sdk-js/src/types.ts
// and sdk-rn/src/types.ts in sync.

export type OptimizationProfile = "driving" | "walking" | "cycling";
export type OptimizationGeometry = "geojson" | "polyline";
export type OptimizationLang = "hy" | "en" | "ru";
export type OptimizationEndpoint = "first" | "last" | "any";

export interface OptimizationWaypoint {
  location: [number, number]; // [lon, lat] — the position Valhalla used for this waypoint
  name: string; // "" when Valhalla supplies none (mirrors DirectionsWaypoint)
  waypointIndex: number; // 0-based position of THIS input waypoint within the optimized trip
  tripsIndex: number; // which trip this waypoint is on (always 0 — single trip)
}

export interface OptimizationResult {
  waypoints: OptimizationWaypoint[]; // INPUT order; waypointIndex gives the optimized position
  trips: DirectionsRoute[]; // always length 1 — the optimized route (normalized)
}

export interface OptimizationParams {
  waypoints: [number, number][]; // ordered [lon, lat], min 2, max 12
  profile?: OptimizationProfile; // default "driving"
  source?: "first" | "any"; // default "first"
  destination?: "last" | "any"; // default "last"
  roundtrip?: boolean; // default false — close the tour at waypoints[0]
  geometries?: OptimizationGeometry; // default "geojson"
  language?: OptimizationLang; // default "hy"
  steps?: boolean; // default false — include turn-by-turn steps in legs
}

// Tilequery / features near a point (S-1.0.0-10-014).
// Vendored byte-identically from sphyra/api/app/Types/tilequery.ts. `distance` is METERS.
// Keep sdk-js/src/types.ts and sdk-rn/src/types.ts in sync.

export type TilequeryLayer = "roads" | "buildings" | "pois" | "water" | "landuse";
export type TilequeryGeometryKind = "point" | "line" | "polygon";

export interface TilequeryMeta {
  distance: number; // meters from the query point (1-decimal)
  layer: TilequeryLayer;
  geometry: TilequeryGeometryKind;
}

export interface TilequeryFeatureProperties {
  [key: string]: unknown;
  tilequery: TilequeryMeta;
}

export interface TilequeryFeature {
  type: "Feature";
  geometry: Record<string, unknown>; // the feature's own GeoJSON geometry
  properties: TilequeryFeatureProperties;
}

export interface TilequeryResult {
  type: "FeatureCollection";
  features: TilequeryFeature[]; // nearest-first
}

export interface TilequeryParams {
  lon: number;
  lat: number;
  radius?: number; // meters, default 50, capped 1000
  limit?: number; // default 5, capped 50
  layers?: TilequeryLayer[]; // default all five
  dedupe?: boolean; // default true
}

// Advanced search / Search-Box parity (S-1.0.0-10-015).
// Vendored byte-identically from sphyra/api/app/Types/search.ts. Distances are METERS.
// Keep sdk-js/src/types.ts and sdk-rn/src/types.ts in sync.

export type SearchCategory =
  | "cafe" | "restaurant" | "pharmacy" | "fuel" | "hospital"
  | "school" | "bank" | "atm" | "supermarket" | "hotel" | "parking";

export interface SearchSuggestion {
  id: string;
  name: string;
  fullName: string;
  placeType: string;
  category: string | null;
  coordinates: [number, number];   // [lon, lat]
  distance: number | null;          // meters from proximity; null when no proximity
}
export interface SearchSuggestResult { suggestions: SearchSuggestion[]; attribution: string; }

export interface SearchAddress {
  street: string | null; city: string | null; district: string | null;
  postalcode: string | null; country: string;
}
export interface SearchFeature {
  id: string; name: string; fullName: string; placeType: string;
  category: string | null; coordinates: [number, number];
  address: SearchAddress; boundingBox: [number, number, number, number] | null;
}
export interface SearchRetrieveResult { feature: SearchFeature; }
export interface SearchForwardResult { features: SearchFeature[]; attribution: string; }

export interface SearchPoi {
  id: string; name: string | null; category: SearchCategory;
  coordinates: [number, number]; distance: number | null;
}
export interface SearchCategoryResult { category: SearchCategory; pois: SearchPoi[]; attribution: string; }

export interface SearchSuggestParams {
  q: string; lang?: GeocodeLang; limit?: number;
  proximity?: [number, number]; sessionToken?: string;
}
export interface SearchRetrieveParams { id: string; lang?: GeocodeLang; sessionToken?: string; }
export interface SearchCategoryParams {
  category: SearchCategory; proximity?: [number, number];
  bbox?: [number, number, number, number]; radius?: number; limit?: number; lang?: GeocodeLang;
}
export interface SearchForwardParams {
  q?: string; street?: string; city?: string; postalcode?: string;
  proximity?: [number, number]; limit?: number; lang?: GeocodeLang;
}

// Standard-style light presets + 2D/3D modes (S-1.0.0-10-016 / contract from S-1.0.0-10-012).
// Read from the served style's `metadata["sphyra:presets"|"sphyra:modes"]`. Keep sdk-js and
// sdk-rn in sync.

export type StylePreset = "dawn" | "day" | "dusk" | "night";
export type StyleMode = "2d" | "3d";

// Static Images API URL builder (S-1.0.0-10-020; server route from S-1.0.0-10-013).
export interface StaticImagePositionCenter {
  kind: "center";
  lon: number;
  lat: number;
  zoom: number;
  bearing?: number; // default 0
  pitch?: number; // default 0
}

export interface StaticImagePositionBbox {
  kind: "bbox";
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

export type StaticImagePosition = StaticImagePositionCenter | StaticImagePositionBbox;

export interface StaticImageUrlParams {
  position: StaticImagePosition;
  width: number; // 1..1280
  height: number; // 1..1280
  retina?: boolean; // default false → append @2x before .png when true
  preset?: StylePreset; // query ?preset=
  mode?: StyleMode; // query ?mode=
  overlay?: string; // optional middle path segment (3-segment route)
}

/** A MapLibre style document (loose: we only index `layers`, `light`, `metadata`). */
export type SphyraStyle = Record<string, unknown>;

export interface SphyraPresetLight {
  anchor: "viewport";
  color: string;
  intensity: number;
  position?: [number, number, number];
}
export interface SphyraPresetFog {
  color: string;
  "horizon-blend": number;
  range: [number, number];
  "high-color": string;
  "space-color": string;
  "star-intensity"?: number;
}
export interface SphyraPresetDef {
  light: SphyraPresetLight;
  fog?: SphyraPresetFog;
  layers: Record<string, Record<string, unknown>>;
}
export interface SphyraModeDef {
  hiddenLayers: string[];
  terrain: { source: string; exaggeration: number } | null;
  pitch: number;
}
