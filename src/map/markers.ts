import maplibregl from "maplibre-gl";

export interface AddMarkerOptions {
  /** [lon, lat]. */
  lngLat: [number, number];
  /** Custom icon DOM element (e.g. an <img> whose src is a sprite icon URL). */
  element?: HTMLElement;
  /** Default-pin color when no `element` is given. */
  color?: string;
  draggable?: boolean;
  anchor?: maplibregl.PositionAnchor;
  /** Pixel offset [x, y]. */
  offset?: [number, number];
  /** Fired on marker-element click. */
  onClick?: (handle: SphyraMarkerHandle) => void;
  /** Fired after a drag completes, with the new [lon, lat]. */
  onDragEnd?: (lngLat: [number, number], handle: SphyraMarkerHandle) => void;
}

export interface SphyraMarkerHandle {
  marker: maplibregl.Marker;
  getLngLat(): [number, number];
  setLngLat(lngLat: [number, number]): void;
  getElement(): HTMLElement;
  remove(): void;
}

/** Add a marker to the map. Returns a handle exposing position get/set, the element, and remove. */
export function addMarker(map: maplibregl.Map, options: AddMarkerOptions): SphyraMarkerHandle {
  const marker = new maplibregl.Marker({
    element: options.element,
    color: options.color,
    draggable: options.draggable ?? false,
    anchor: options.anchor,
    offset: options.offset,
  });
  marker.setLngLat(options.lngLat).addTo(map);

  const handle: SphyraMarkerHandle = {
    marker,
    getLngLat() {
      const { lng, lat } = marker.getLngLat();
      return [lng, lat];
    },
    setLngLat(lngLat) {
      marker.setLngLat(lngLat);
    },
    getElement() {
      return marker.getElement();
    },
    remove() {
      marker.remove();
    },
  };

  if (options.onClick) {
    marker.getElement().addEventListener("click", () => options.onClick!(handle));
  }
  if (options.onDragEnd) {
    marker.on("dragend", () => options.onDragEnd!(handle.getLngLat(), handle));
  }
  return handle;
}
