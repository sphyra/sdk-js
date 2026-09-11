import { beforeEach, describe, expect, it, vi } from "vitest";

const { PopupCtor, popupInstance } = vi.hoisted(() => {
  const popupInstance = {
    setHTML: vi.fn(function () {
      return popupInstance;
    }),
    setDOMContent: vi.fn(function () {
      return popupInstance;
    }),
    setLngLat: vi.fn(function () {
      return popupInstance;
    }),
    addTo: vi.fn(function () {
      return popupInstance;
    }),
    remove: vi.fn(function () {
      return popupInstance;
    }),
    isOpen: vi.fn(() => true),
  };
  const PopupCtor = vi.fn(() => popupInstance);
  return { PopupCtor, popupInstance };
});

vi.mock("maplibre-gl", () => ({ default: { Popup: PopupCtor } }));

import { addPopup } from "../src/map/popups";

const map = {} as unknown as import("maplibre-gl").Map;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("addPopup", () => {
  it("P1 — coordinate mode: setLngLat + addTo when open defaults true; html → setHTML", () => {
    addPopup(map, { lngLat: [44.5, 40.18], html: "<b>hi</b>" });

    expect(PopupCtor).toHaveBeenCalledTimes(1);
    expect(popupInstance.setHTML).toHaveBeenCalledWith("<b>hi</b>");
    expect(popupInstance.setLngLat).toHaveBeenCalledWith([44.5, 40.18]);
    expect(popupInstance.addTo).toHaveBeenCalledWith(map);
  });

  it("P2 — open:false does not addTo", () => {
    addPopup(map, { lngLat: [44.5, 40.18], html: "x", open: false });
    expect(popupInstance.setLngLat).toHaveBeenCalledWith([44.5, 40.18]);
    expect(popupInstance.addTo).not.toHaveBeenCalled();
  });

  it("P3 — element → setDOMContent (not setHTML)", () => {
    const el = {} as HTMLElement;
    addPopup(map, { lngLat: [44.5, 40.18], element: el });
    expect(popupInstance.setDOMContent).toHaveBeenCalledWith(el);
    expect(popupInstance.setHTML).not.toHaveBeenCalled();
  });

  it("P4 — marker mode: marker.setPopup(popup) called; no addTo", () => {
    const marker = { setPopup: vi.fn() } as unknown as import("maplibre-gl").Marker;
    addPopup(map, { marker, html: "hi" });

    expect(marker.setPopup).toHaveBeenCalledWith(popupInstance);
    expect(popupInstance.addTo).not.toHaveBeenCalled();
    expect(popupInstance.setLngLat).not.toHaveBeenCalled();
  });

  it("P5 — handle delegates: setContent/open/close/isOpen/remove", () => {
    const handle = addPopup(map, { lngLat: [44.5, 40.18], html: "x", open: false });

    expect(handle.popup).toBe(popupInstance);

    handle.setContent("str");
    expect(popupInstance.setHTML).toHaveBeenCalledWith("str");

    const el = {} as HTMLElement;
    handle.setContent(el);
    expect(popupInstance.setDOMContent).toHaveBeenCalledWith(el);

    handle.open();
    expect(popupInstance.addTo).toHaveBeenCalledWith(map);

    handle.close();
    handle.remove();
    expect(popupInstance.remove).toHaveBeenCalledTimes(2);

    expect(handle.isOpen()).toBe(true);
    expect(popupInstance.isOpen).toHaveBeenCalled();
  });
});
