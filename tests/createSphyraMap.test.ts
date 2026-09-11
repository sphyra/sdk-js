import { beforeEach, describe, expect, it, vi } from "vitest";

// Shared spies for the mocked maplibre-gl Map. Defined via vi.hoisted so the
// vi.mock factory (which vitest hoists to the top of the module) can reference them.
const { mapInstance, MapCtor, handlers } = vi.hoisted(() => {
  const handlers: Record<string, (e?: unknown) => void> = {};
  const mapInstance = {
    on: vi.fn((ev: string, cb: (e?: unknown) => void) => {
      handlers[ev] = cb;
    }),
    getLayer: vi.fn(() => ({})),
    setLight: vi.fn(),
    setPaintProperty: vi.fn(),
    setLayoutProperty: vi.fn(),
    setTerrain: vi.fn(),
    easeTo: vi.fn(),
    isSourceLoaded: vi.fn(() => true),
    addControl: vi.fn(),
    remove: vi.fn(),
  };
  const MapCtor = vi.fn(() => mapInstance);
  return { mapInstance, MapCtor, handlers };
});

vi.mock("maplibre-gl", () => ({ default: { Map: MapCtor } }));

import { createSphyraMap } from "../src/map/createSphyraMap";
import type { SphyraClient } from "../src/SphyraClient";

const BASE = "http://127.0.0.1:4000";

/** A style carrying the 10-012 metadata tables (background + the two 3D-only layers). */
function fakeStyle() {
  return {
    version: 8,
    light: { anchor: "viewport", color: "#ffffff", intensity: 0.5 },
    layers: [{ id: "background" }, { id: "buildings-3d" }, { id: "terrain-hillshade" }],
    metadata: {
      "sphyra:presets": {
        day: {
          light: { anchor: "viewport", color: "#ffffff", intensity: 0.5 },
          layers: { background: { "background-color": "#e8e8e8" } },
        },
        night: {
          light: { anchor: "viewport", color: "#0b1020", intensity: 0.2 },
          layers: { background: { "background-color": "#0b1020" } },
        },
      },
      "sphyra:modes": {
        "2d": { hiddenLayers: ["buildings-3d", "terrain-hillshade"], terrain: null, pitch: 0 },
        "3d": {
          hiddenLayers: [],
          terrain: { source: "sphyra_terrain", exaggeration: 1 },
          pitch: 45,
        },
      },
      "sphyra:activePreset": "day",
      "sphyra:activeMode": "3d",
    },
  };
}

function makeClient(getMapStyle = vi.fn().mockResolvedValue(fakeStyle())) {
  return {
    getMapStyle,
    baseUrl: BASE,
    authHeaders: () => ({ Authorization: "Bearer k" }),
  } as unknown as SphyraClient & { getMapStyle: ReturnType<typeof vi.fn> };
}

/** Pull the options object passed to `new maplibregl.Map(opts)`. */
function ctorArgs(): Record<string, any> {
  return MapCtor.mock.calls[0]![0] as Record<string, any>;
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(handlers)) delete handlers[k];
});

describe("createSphyraMap", () => {
  it("C1 — fetches the style once and constructs the map with center/zoom/transformRequest", async () => {
    const client = makeClient();

    await createSphyraMap("map", { client, center: [44.5, 40.18], zoom: 12 });

    expect(client.getMapStyle).toHaveBeenCalledTimes(1);
    expect(MapCtor).toHaveBeenCalledTimes(1);
    const arg = ctorArgs();
    expect(arg["center"]).toEqual([44.5, 40.18]);
    expect(arg["zoom"]).toBe(12);
    expect(typeof arg["transformRequest"]).toBe("function");
  });

  it("C2 — transformRequest signs unsigned API URLs and leaves signed/foreign URLs alone", async () => {
    const client = makeClient();

    await createSphyraMap("map", { client });
    const tr = ctorArgs()["transformRequest"] as (url: string) => { url: string; headers?: Record<string, string> };

    expect(tr(`${BASE}/api/v1/fonts/x`)).toEqual({
      url: `${BASE}/api/v1/fonts/x`,
      headers: { Authorization: "Bearer k" },
    });
    expect(tr(`${BASE}/tiles/a?sig=z`).headers).toBeUndefined();
    expect(tr("https://other.example/x").headers).toBeUndefined();
  });

  it("C2b — a consumer transformRequest rewrites the URL before signing (composed, not replaced)", async () => {
    const client = makeClient();
    // Rewrite any absolute API/tiles URL to a same-origin proxy host.
    const transformRequest = (url: string) => {
      const u = new URL(url);
      if (u.pathname.startsWith("/tiles") || u.pathname.startsWith("/api")) {
        return { url: `http://localhost:5173${u.pathname}${u.search}` };
      }
      return undefined;
    };

    await createSphyraMap("map", { client, transformRequest });
    const tr = ctorArgs()["transformRequest"] as (url: string) => { url: string; headers?: Record<string, string> };

    // Signed cross-origin tile URL → rewritten same-origin, signature untouched, no auth header.
    expect(tr(`http://192.168.1.3:4000/tiles/a/1/2/3?sig=z&expires=9`)).toEqual({
      url: "http://localhost:5173/tiles/a/1/2/3?sig=z&expires=9",
    });
    // Non-API URLs are left alone by the consumer transform (returns undefined).
    expect(tr("https://other.example/x")).toEqual({ url: "https://other.example/x" });
  });

  it("C3 — on load, applies preset + mode + fires onLoad", async () => {
    const client = makeClient();
    const onLoad = vi.fn();

    const handle = await createSphyraMap("map", { client, preset: "day", mode: "3d", onLoad });
    handlers["load"]!();

    expect(mapInstance.setLight).toHaveBeenCalled();
    expect(mapInstance.setPaintProperty).toHaveBeenCalled();
    expect(mapInstance.setLayoutProperty).toHaveBeenCalled();
    expect(mapInstance.setTerrain).toHaveBeenCalled();
    expect(mapInstance.easeTo).toHaveBeenCalled();
    expect(onLoad).toHaveBeenCalledWith(handle.map);
  });

  it("C4 — setPreset('night') / setMode('2d') re-apply the runtime setters", async () => {
    const client = makeClient();

    const handle = await createSphyraMap("map", { client, preset: "day", mode: "3d" });
    handlers["load"]!();
    mapInstance.setLight.mockClear();
    mapInstance.setLayoutProperty.mockClear();

    handle.setPreset("night");
    expect(mapInstance.setLight).toHaveBeenCalledTimes(1);

    handle.setMode("2d");
    expect(mapInstance.setLayoutProperty).toHaveBeenCalledWith("buildings-3d", "visibility", "none");
  });

  it("C5 — fetch failure → onError called and the promise rejects", async () => {
    const err = new Error("style boom");
    const client = makeClient(vi.fn().mockRejectedValue(err));
    const onError = vi.fn();

    await expect(createSphyraMap("map", { client, onError })).rejects.toBe(err);
    expect(onError).toHaveBeenCalledWith(err);
    expect(MapCtor).not.toHaveBeenCalled();
  });

  it("C6 — destroy() calls map.remove()", async () => {
    const client = makeClient();

    const handle = await createSphyraMap("map", { client });
    handle.destroy();

    expect(mapInstance.remove).toHaveBeenCalledTimes(1);
  });

  it("C7 — fires onLoad without map 'load' once non-terrain sources are loaded (terrain stall)", async () => {
    // A style with vector sources + a raster-dem (terrain) source. The terrain source can stall
    // 'load' forever when overzoomed; readiness must still fire from non-terrain sources.
    const style = {
      ...fakeStyle(),
      sources: {
        sphyra_roads: { type: "vector" },
        sphyra_terrain: { type: "raster-dem" },
      },
    };
    const client = makeClient(vi.fn().mockResolvedValue(style));
    const onLoad = vi.fn();

    const handle = await createSphyraMap("map", { client, preset: "day", mode: "3d", onLoad });

    // 'load' never fires (terrain stalled). The sourcedata handler must drive readiness.
    expect(handlers["load"]).toBeTypeOf("function");
    expect(handlers["sourcedata"]).toBeTypeOf("function");
    expect(onLoad).not.toHaveBeenCalled();

    handlers["sourcedata"]!();

    expect(mapInstance.isSourceLoaded).toHaveBeenCalledWith("sphyra_roads");
    expect(mapInstance.isSourceLoaded).not.toHaveBeenCalledWith("sphyra_terrain");
    expect(onLoad).toHaveBeenCalledWith(handle.map);
    expect(mapInstance.setTerrain).toHaveBeenCalled(); // mode applied exactly once
  });

  it("C8 — sourcedata before non-terrain sources finish does not fire onLoad", async () => {
    const style = {
      ...fakeStyle(),
      sources: { sphyra_roads: { type: "vector" }, sphyra_terrain: { type: "raster-dem" } },
    };
    const client = makeClient(vi.fn().mockResolvedValue(style));
    const onLoad = vi.fn();
    mapInstance.isSourceLoaded.mockReturnValue(false);

    await createSphyraMap("map", { client, onLoad });
    handlers["sourcedata"]!();

    expect(onLoad).not.toHaveBeenCalled();
  });
});
