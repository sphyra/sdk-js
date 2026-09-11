import { beforeEach, describe, expect, it, vi } from "vitest";

// Shared spies for the mocked maplibre-gl Marker. Defined via vi.hoisted so the
// vi.mock factory (hoisted to the top of the module) can reference them.
const { MarkerCtor, markerInstance, elementStub, elementHandlers, markerHandlers } = vi.hoisted(
  () => {
    const elementHandlers: Record<string, (e?: unknown) => void> = {};
    const markerHandlers: Record<string, (e?: unknown) => void> = {};
    const elementStub = {
      addEventListener: vi.fn((ev: string, cb: (e?: unknown) => void) => {
        elementHandlers[ev] = cb;
      }),
    };
    const markerInstance = {
      setLngLat: vi.fn(function () {
        return markerInstance;
      }),
      addTo: vi.fn(function () {
        return markerInstance;
      }),
      getLngLat: vi.fn(() => ({ lng: 44.5, lat: 40.18 })),
      getElement: vi.fn(() => elementStub),
      setPopup: vi.fn(function () {
        return markerInstance;
      }),
      on: vi.fn((ev: string, cb: (e?: unknown) => void) => {
        markerHandlers[ev] = cb;
      }),
      remove: vi.fn(),
    };
    const MarkerCtor = vi.fn(() => markerInstance);
    return { MarkerCtor, markerInstance, elementStub, elementHandlers, markerHandlers };
  },
);

vi.mock("maplibre-gl", () => ({ default: { Marker: MarkerCtor } }));

import { addMarker } from "../src/map/markers";

const map = {} as unknown as import("maplibre-gl").Map;

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(elementHandlers)) delete elementHandlers[k];
  for (const k of Object.keys(markerHandlers)) delete markerHandlers[k];
});

describe("addMarker", () => {
  it("M1 — constructs a Marker with element/color/draggable/anchor/offset, setLngLat + addTo", () => {
    const element = elementStub as unknown as HTMLElement;
    addMarker(map, {
      lngLat: [44.5, 40.18],
      element,
      color: "#f00",
      draggable: true,
      anchor: "bottom",
      offset: [1, 2],
    });

    expect(MarkerCtor).toHaveBeenCalledTimes(1);
    expect(MarkerCtor).toHaveBeenCalledWith({
      element,
      color: "#f00",
      draggable: true,
      anchor: "bottom",
      offset: [1, 2],
    });
    expect(markerInstance.setLngLat).toHaveBeenCalledWith([44.5, 40.18]);
    expect(markerInstance.addTo).toHaveBeenCalledWith(map);
  });

  it("M1b — draggable defaults to false when omitted", () => {
    addMarker(map, { lngLat: [44.5, 40.18] });
    expect(MarkerCtor.mock.calls[0]![0]).toMatchObject({ draggable: false });
  });

  it("M2 — onClick fires on element click with the handle", () => {
    const onClick = vi.fn();
    const handle = addMarker(map, { lngLat: [44.5, 40.18], onClick });

    expect(elementStub.addEventListener).toHaveBeenCalledWith("click", expect.any(Function));
    elementHandlers["click"]!();
    expect(onClick).toHaveBeenCalledWith(handle);
  });

  it("M3 — onDragEnd fires on dragend with the new lngLat", () => {
    const onDragEnd = vi.fn();
    const handle = addMarker(map, { lngLat: [44.5, 40.18], draggable: true, onDragEnd });

    expect(markerInstance.on).toHaveBeenCalledWith("dragend", expect.any(Function));
    markerHandlers["dragend"]!();
    expect(onDragEnd).toHaveBeenCalledWith([44.5, 40.18], handle);
  });

  it("M4 — handle methods delegate to the marker", () => {
    const handle = addMarker(map, { lngLat: [44.5, 40.18] });

    expect(handle.marker).toBe(markerInstance);
    expect(handle.getLngLat()).toEqual([44.5, 40.18]);

    handle.setLngLat([1, 2]);
    expect(markerInstance.setLngLat).toHaveBeenCalledWith([1, 2]);

    expect(handle.getElement()).toBe(elementStub);

    handle.remove();
    expect(markerInstance.remove).toHaveBeenCalledTimes(1);
  });
});
