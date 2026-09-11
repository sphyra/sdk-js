import maplibregl from "maplibre-gl";

export interface AddPopupOptions {
  /** Bind to a coordinate [lon, lat]. Provide this OR `marker`. */
  lngLat?: [number, number];
  /** Bind to an existing marker (uses marker.setPopup). Provide this OR `lngLat`. */
  marker?: maplibregl.Marker;
  /** HTML string content. Provide this OR `element`. */
  html?: string;
  /** DOM content. Provide this OR `html`. */
  element?: HTMLElement;
  closeButton?: boolean;
  closeOnClick?: boolean;
  /** Pixel offset. */
  offset?: number;
  /** Open the popup immediately (coordinate mode only). Default true. Ignored when bound to a marker. */
  open?: boolean;
}

export interface SphyraPopupHandle {
  popup: maplibregl.Popup;
  setContent(content: string | HTMLElement): void;
  open(): void;
  close(): void;
  isOpen(): boolean;
  remove(): void;
}

/** Create a popup bound to a coordinate or a marker, with HTML/DOM content and open/close control. */
export function addPopup(map: maplibregl.Map, options: AddPopupOptions): SphyraPopupHandle {
  const popup = new maplibregl.Popup({
    closeButton: options.closeButton,
    closeOnClick: options.closeOnClick,
    offset: options.offset,
  });

  if (options.element !== undefined) popup.setDOMContent(options.element);
  else if (options.html !== undefined) popup.setHTML(options.html);

  if (options.marker) {
    options.marker.setPopup(popup);
  } else if (options.lngLat) {
    popup.setLngLat(options.lngLat);
    if (options.open !== false) popup.addTo(map);
  }

  return {
    popup,
    setContent(content) {
      if (typeof content === "string") popup.setHTML(content);
      else popup.setDOMContent(content);
    },
    open() {
      popup.addTo(map);
    },
    close() {
      popup.remove();
    },
    isOpen() {
      return popup.isOpen();
    },
    remove() {
      popup.remove();
    },
  };
}
