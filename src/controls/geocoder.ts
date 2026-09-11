import type maplibregl from "maplibre-gl";
import type { SphyraClient } from "../SphyraClient";
import type { GeocodeLang, SearchFeature, SearchSuggestion } from "../types";
import { addMarker, type SphyraMarkerHandle } from "../map/markers";

const DEBOUNCE_MS = 400;
const MIN_QUERY_LENGTH = 2;

export interface SphyraGeocoderControlOptions {
  client: SphyraClient;
  lang?: GeocodeLang; // default "hy"
  limit?: number;
  placeholder?: string; // default "Search"
  flyTo?: boolean; // default true
  marker?: boolean; // default true
  onResult?: (feature: SearchFeature) => void;
  onError?: (error: unknown) => void;
}

/**
 * A maplibre-gl IControl: a debounced search input + suggestion list. Suggestions come from
 * client.searchSuggest() with proximity = the map center; selecting one calls client.searchRetrieve()
 * then flies the map there and drops a marker. One session token per control (Search-Box parity).
 */
export class SphyraGeocoderControl implements maplibregl.IControl {
  private map: maplibregl.Map | undefined;
  private container: HTMLElement | undefined;
  private input: HTMLInputElement | undefined;
  private list: HTMLUListElement | undefined;
  private marker: SphyraMarkerHandle | undefined;
  private readonly sessionToken = Math.random().toString(36).slice(2);
  private timer: ReturnType<typeof setTimeout> | undefined;
  private controller: AbortController | undefined; // latest-wins for suggest

  constructor(private options: SphyraGeocoderControlOptions) {}

  onAdd(map: maplibregl.Map): HTMLElement {
    this.map = map;
    const container = document.createElement("div");
    container.className = "maplibregl-ctrl maplibregl-ctrl-group sphyra-geocoder-ctrl";

    const input = document.createElement("input");
    input.type = "text";
    input.className = "sphyra-geocoder-input";
    input.placeholder = this.options.placeholder ?? "Search";
    input.addEventListener("input", () => this.onInput(input.value));

    const list = document.createElement("ul");
    list.className = "sphyra-geocoder-suggestions";

    container.append(input, list);
    this.container = container;
    this.input = input;
    this.list = list;
    return container;
  }

  onRemove(): void {
    if (this.timer) clearTimeout(this.timer);
    this.controller?.abort();
    this.marker?.remove();
    this.container?.remove();
    this.map = undefined;
  }

  private onInput(value: string): void {
    if (this.timer) clearTimeout(this.timer);
    const trimmed = value.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      this.renderSuggestions([]);
      return;
    }
    this.timer = setTimeout(() => void this.suggest(trimmed), DEBOUNCE_MS);
  }

  private async suggest(q: string): Promise<void> {
    const map = this.map;
    if (!map) return;
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    const center = map.getCenter();
    try {
      const result = await this.options.client.searchSuggest({
        q,
        lang: this.options.lang,
        limit: this.options.limit,
        proximity: [center.lng, center.lat],
        sessionToken: this.sessionToken,
      });
      if (controller.signal.aborted) return;
      this.renderSuggestions(result.suggestions);
    } catch (err) {
      if (controller.signal.aborted) return;
      this.options.onError?.(err);
    }
  }

  private renderSuggestions(suggestions: SearchSuggestion[]): void {
    const list = this.list;
    if (!list) return;
    list.replaceChildren();
    for (const s of suggestions) {
      const li = document.createElement("li");
      li.className = "sphyra-geocoder-suggestion";
      li.textContent = s.fullName;
      li.addEventListener("click", () => void this.select(s));
      list.appendChild(li);
    }
  }

  private async select(suggestion: SearchSuggestion): Promise<void> {
    const map = this.map;
    if (!map) return;
    let feature: SearchFeature;
    try {
      const r = await this.options.client.searchRetrieve({
        id: suggestion.id,
        lang: this.options.lang,
        sessionToken: this.sessionToken,
      });
      feature = r.feature;
    } catch (err) {
      this.options.onError?.(err);
      return;
    }
    if (this.input) this.input.value = feature.fullName;
    this.renderSuggestions([]);
    const [lon, lat] = feature.coordinates;
    if (this.options.flyTo !== false) map.flyTo({ center: [lon, lat], zoom: 15 });
    if (this.options.marker !== false) {
      this.marker?.remove();
      this.marker = addMarker(map, { lngLat: [lon, lat] });
    }
    this.options.onResult?.(feature);
  }
}
