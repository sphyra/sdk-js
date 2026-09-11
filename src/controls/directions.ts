import type maplibregl from "maplibre-gl";
import type { SphyraClient } from "../SphyraClient";
import type { DirectionsLang, DirectionsProfile, DirectionsResult, GeoJSONLineString } from "../types";
import { addMarker, type SphyraMarkerHandle } from "../map/markers";

const ROUTE_SOURCE_ID = "sphyra-directions-route";
const ROUTE_LAYER_ID = "sphyra-directions-route-line";
const PROFILES: readonly DirectionsProfile[] = ["driving", "walking", "cycling"];
const START_COLOR = "#22c55e";
const END_COLOR = "#ef4444";

export interface SphyraDirectionsControlOptions {
  client: SphyraClient;
  profile?: DirectionsProfile; // default "driving"
  language?: DirectionsLang; // default "hy" (server default applies if omitted)
  lineColor?: string; // default "#2563eb"
  lineWidth?: number; // default 5
  /** When true, map clicks add waypoints (start → destination). Default false. */
  interactive?: boolean;
  onRoute?: (result: DirectionsResult) => void;
  onError?: (error: unknown) => void;
}

/**
 * MapLibre IControl: profile switch, clear, turn-by-turn list, optional map-click routing.
 * Call setWaypoints([lon,lat]×≥2) or enable interactive mode and click start + destination.
 */
export class SphyraDirectionsControl implements maplibregl.IControl {
  private map: maplibregl.Map | undefined;
  private container: HTMLElement | undefined;
  private stepsList: HTMLOListElement | undefined;
  private hintEl: HTMLElement | undefined;
  private waypoints: [number, number][] = [];
  private markers: SphyraMarkerHandle[] = [];
  private profile: DirectionsProfile;
  private pickingEnabled: boolean;
  private readonly onMapClick = (e: maplibregl.MapMouseEvent) => {
    if (!this.pickingEnabled) return;
    void this.addWaypointFromMap([e.lngLat.lng, e.lngLat.lat]);
  };

  constructor(private options: SphyraDirectionsControlOptions) {
    this.profile = options.profile ?? "driving";
    this.pickingEnabled = options.interactive ?? false;
  }

  onAdd(map: maplibregl.Map): HTMLElement {
    this.map = map;
    const container = document.createElement("div");
    container.className = "maplibregl-ctrl sphyra-directions-ctrl";

    const hint = document.createElement("p");
    hint.className = "sphyra-directions-hint";

    const toolbar = document.createElement("div");
    toolbar.className = "sphyra-directions-toolbar";

    const select = document.createElement("select");
    select.className = "sphyra-directions-profile";
    for (const p of PROFILES) {
      const opt = document.createElement("option");
      opt.value = p;
      opt.textContent = p;
      if (p === this.profile) opt.selected = true;
      select.appendChild(opt);
    }
    select.addEventListener("change", () => {
      this.profile = select.value as DirectionsProfile;
      void this.refresh();
    });

    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "sphyra-directions-clear";
    clearBtn.textContent = "Clear";
    clearBtn.addEventListener("click", () => this.clear());

    toolbar.append(select, clearBtn);

    const steps = document.createElement("ol");
    steps.className = "sphyra-directions-steps";

    container.append(hint, toolbar, steps);
    this.container = container;
    this.hintEl = hint;
    this.stepsList = steps;

    map.on("click", this.onMapClick);
    this.updateHint();
    return container;
  }

  onRemove(): void {
    const map = this.map;
    if (map) {
      map.off("click", this.onMapClick);
      if (map.getLayer(ROUTE_LAYER_ID)) map.removeLayer(ROUTE_LAYER_ID);
      if (map.getSource(ROUTE_SOURCE_ID)) map.removeSource(ROUTE_SOURCE_ID);
    }
    this.clearMarkers();
    this.container?.remove();
    this.map = undefined;
  }

  /** Enable or disable map-click waypoint picking (e.g. when the Directions tab is active). */
  setInteractive(enabled: boolean): void {
    this.pickingEnabled = enabled;
    this.updateHint();
    const canvas = this.map?.getCanvas();
    if (canvas) canvas.style.cursor = enabled ? "crosshair" : "";
  }

  /** Set ordered [lon,lat] waypoints (≥2) and request + draw the route. */
  async setWaypoints(waypoints: [number, number][]): Promise<void> {
    this.waypoints = waypoints.slice(0, 2);
    this.syncMarkers();
    await this.refresh();
    this.updateHint();
  }

  /** Add a waypoint from a map click — first click = start, second = destination. */
  async addWaypointFromMap(lngLat: [number, number]): Promise<void> {
    if (this.waypoints.length < 2) {
      this.waypoints.push(lngLat);
    } else {
      this.waypoints[1] = lngLat;
    }
    this.syncMarkers();
    await this.refresh();
    this.updateHint();
  }

  /** Remove the route, markers, and step list. */
  clear(): void {
    this.waypoints = [];
    this.clearMarkers();
    const source = this.map?.getSource(ROUTE_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    source?.setData({ type: "FeatureCollection", features: [] });
    this.stepsList?.replaceChildren();
    this.updateHint();
  }

  private clearMarkers(): void {
    for (const m of this.markers) m.remove();
    this.markers = [];
  }

  private syncMarkers(): void {
    const map = this.map;
    if (!map) return;
    this.clearMarkers();
    const colors = [START_COLOR, END_COLOR];
    this.waypoints.forEach((lngLat, i) => {
      const handle = addMarker(map, {
        lngLat,
        color: colors[i] ?? END_COLOR,
        draggable: true,
        onDragEnd: (pt) => {
          this.waypoints[i] = pt;
          void this.refresh();
        },
      });
      this.markers.push(handle);
    });
  }

  private updateHint(): void {
    const hint = this.hintEl;
    if (!hint) return;
    if (!this.pickingEnabled) {
      hint.textContent = "Select the Directions tab, then click the map to set start and destination.";
      return;
    }
    if (this.waypoints.length === 0) {
      hint.textContent = "Click the map to set your starting point (A).";
    } else if (this.waypoints.length === 1) {
      hint.textContent = "Click the map to set your destination (B).";
    } else {
      hint.textContent = "Route shown. Click the map to move destination, drag markers, or Clear to reset.";
    }
  }

  private async refresh(): Promise<void> {
    const map = this.map;
    if (!map || this.waypoints.length < 2) {
      const source = map?.getSource(ROUTE_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
      source?.setData({ type: "FeatureCollection", features: [] });
      if (this.waypoints.length === 0) this.stepsList?.replaceChildren();
      return;
    }
    let result: DirectionsResult;
    try {
      result = await this.options.client.directions({
        waypoints: this.waypoints,
        profile: this.profile,
        geometries: "geojson",
        language: this.options.language,
        steps: true,
      });
    } catch (err) {
      this.options.onError?.(err);
      return;
    }
    const route = result.routes[0];
    if (!route) {
      this.clear();
      return;
    }
    this.ensureRouteLayer(map);
    const fc: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: [{ type: "Feature", properties: {}, geometry: route.geometry as GeoJSONLineString }],
    };
    (map.getSource(ROUTE_SOURCE_ID) as maplibregl.GeoJSONSource).setData(fc);
    this.renderSteps(result);
    this.options.onRoute?.(result);
  }

  private ensureRouteLayer(map: maplibregl.Map): void {
    if (map.getSource(ROUTE_SOURCE_ID)) return;
    map.addSource(ROUTE_SOURCE_ID, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    } as maplibregl.SourceSpecification);
    map.addLayer({
      id: ROUTE_LAYER_ID,
      type: "line",
      source: ROUTE_SOURCE_ID,
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": this.options.lineColor ?? "#2563eb",
        "line-width": this.options.lineWidth ?? 5,
      },
    } as maplibregl.LayerSpecification);
  }

  private renderSteps(result: DirectionsResult): void {
    const list = this.stepsList;
    if (!list) return;
    list.replaceChildren();
    for (const leg of result.routes[0]?.legs ?? []) {
      for (const step of leg.steps) {
        const li = document.createElement("li");
        li.textContent = step.maneuver.instruction;
        list.appendChild(li);
      }
    }
  }
}
