import { beforeEach, describe, expect, it, vi } from "vitest";

// Spy constructors for the three maplibre-gl built-in controls. Defined via vi.hoisted so the
// vi.mock factory (hoisted to the top of the module) can reference them.
const { NavigationControl, GeolocateControl, ScaleControl } = vi.hoisted(() => ({
  NavigationControl: vi.fn(),
  GeolocateControl: vi.fn(),
  ScaleControl: vi.fn(),
}));

vi.mock("maplibre-gl", () => ({
  default: { NavigationControl, GeolocateControl, ScaleControl },
}));

import { addGeolocateControl, addNavigationControl, addScaleControl } from "../../src/controls/builtins";
import type maplibregl from "maplibre-gl";

function makeMap() {
  return { addControl: vi.fn() } as unknown as maplibregl.Map & { addControl: ReturnType<typeof vi.fn> };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("controls/builtins", () => {
  it("B1 — addNavigationControl constructs with defaults, addControl(ctrl, 'top-right'), returns control", () => {
    const map = makeMap();
    const ctrl = addNavigationControl(map);

    expect(NavigationControl).toHaveBeenCalledWith({
      showCompass: true,
      showZoom: true,
      visualizePitch: true,
    });
    expect(map.addControl).toHaveBeenCalledWith(ctrl, "top-right");
    expect(ctrl).toBe(NavigationControl.mock.instances[0]);
  });

  it("B2 — addGeolocateControl constructs with high-accuracy + tracking + showUserLocation; default top-right", () => {
    const map = makeMap();
    const ctrl = addGeolocateControl(map);

    expect(GeolocateControl).toHaveBeenCalledWith({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
      showUserLocation: true,
    });
    expect(map.addControl).toHaveBeenCalledWith(ctrl, "top-right");
  });

  it("B3 — addScaleControl constructs with metric defaults; default bottom-left", () => {
    const map = makeMap();
    const ctrl = addScaleControl(map);

    expect(ScaleControl).toHaveBeenCalledWith({ maxWidth: 100, unit: "metric" });
    expect(map.addControl).toHaveBeenCalledWith(ctrl, "bottom-left");
  });

  it("B4 — option + position overrides flow through", () => {
    const map = makeMap();
    addScaleControl(map, { maxWidth: 200, unit: "imperial" }, "bottom-right");

    expect(ScaleControl).toHaveBeenCalledWith({ maxWidth: 200, unit: "imperial" });
    expect(map.addControl).toHaveBeenCalledWith(expect.anything(), "bottom-right");

    addNavigationControl(map, { showCompass: false, showZoom: false, visualizePitch: false }, "top-left");
    expect(NavigationControl).toHaveBeenCalledWith({
      showCompass: false,
      showZoom: false,
      visualizePitch: false,
    });
    expect(map.addControl).toHaveBeenCalledWith(expect.anything(), "top-left");
  });
});
