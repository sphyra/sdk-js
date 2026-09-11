// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SphyraDirectionsControl } from "../../src/controls/directions";
import type maplibregl from "maplibre-gl";
import type { SphyraClient } from "../../src/SphyraClient";
import type { DirectionsResult } from "../../src/types";

vi.mock("../../src/map/markers", () => ({
  addMarker: vi.fn(() => ({
    remove: vi.fn(),
    getLngLat: () => [0, 0] as [number, number],
    setLngLat: vi.fn(),
    getElement: () => document.createElement("div"),
    marker: {},
  })),
}));

const ROUTE_SOURCE_ID = "sphyra-directions-route";
const ROUTE_LAYER_ID = "sphyra-directions-route-line";

function makeResult(): DirectionsResult {
  return {
    routes: [
      {
        geometry: { type: "LineString", coordinates: [[44.5, 40.1], [44.6, 40.2]] },
        distance: 1234,
        duration: 200,
        legs: [
          {
            distance: 1234,
            duration: 200,
            steps: [
              { maneuver: { type: 1, instruction: "Turn left", location: [44.5, 40.1] }, name: "A St", distance: 600, duration: 100 },
              { maneuver: { type: 4, instruction: "Arrive", location: [44.6, 40.2] }, name: "", distance: 634, duration: 100 },
            ],
          },
        ],
      },
    ],
    waypoints: [
      { location: [44.5, 40.1], name: "" },
      { location: [44.6, 40.2], name: "" },
    ],
  };
}

/** Stateful map stub: getSource returns a setData-capable object only after addSource. */
function makeMap() {
  const setData = vi.fn();
  let sourceAdded = false;
  let layerAdded = false;
  const map = {
    getSource: vi.fn(() => (sourceAdded ? { setData } : undefined)),
    getLayer: vi.fn(() => (layerAdded ? {} : undefined)),
    addSource: vi.fn(() => {
      sourceAdded = true;
    }),
    addLayer: vi.fn(() => {
      layerAdded = true;
    }),
    removeLayer: vi.fn(() => {
      layerAdded = false;
    }),
    removeSource: vi.fn(() => {
      sourceAdded = false;
    }),
    on: vi.fn(),
    off: vi.fn(),
    getCanvas: vi.fn(() => ({ style: { cursor: "" } })),
  };
  return { map: map as unknown as maplibregl.Map, setData };
}

function makeClient(directions = vi.fn().mockResolvedValue(makeResult())) {
  return { directions } as unknown as SphyraClient & { directions: ReturnType<typeof vi.fn> };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SphyraDirectionsControl", () => {
  it("DR1 — onAdd returns profile <select>, clear <button>, hint, steps <ol>", () => {
    const ctrl = new SphyraDirectionsControl({ client: makeClient() });
    const { map } = makeMap();
    const container = ctrl.onAdd(map);

    expect(container.querySelectorAll("select.sphyra-directions-profile option").length).toBe(3);
    expect(container.querySelector("button.sphyra-directions-clear")).not.toBeNull();
    expect(container.querySelector("p.sphyra-directions-hint")).not.toBeNull();
    expect(container.querySelector("ol.sphyra-directions-steps")).not.toBeNull();
    expect(map.on).toHaveBeenCalledWith("click", expect.any(Function));
  });

  it("DR2 — setWaypoints requests the route, adds source+layer, setData with the LineString FC", async () => {
    const client = makeClient();
    const ctrl = new SphyraDirectionsControl({ client });
    const { map, setData } = makeMap();
    ctrl.onAdd(map);

    await ctrl.setWaypoints([[44.5, 40.1], [44.6, 40.2]]);

    expect(client.directions).toHaveBeenCalledWith(
      expect.objectContaining({
        waypoints: [[44.5, 40.1], [44.6, 40.2]],
        profile: "driving",
        geometries: "geojson",
        steps: true,
      }),
    );
    expect(map.addSource).toHaveBeenCalledWith(ROUTE_SOURCE_ID, expect.anything());
    expect(map.addLayer).toHaveBeenCalledWith(expect.objectContaining({ id: ROUTE_LAYER_ID, type: "line" }));
    expect(setData).toHaveBeenCalledWith({
      type: "FeatureCollection",
      features: [
        { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[44.5, 40.1], [44.6, 40.2]] } },
      ],
    });
  });

  it("DR3 — renders one <li> per step and fires onRoute", async () => {
    const onRoute = vi.fn();
    const ctrl = new SphyraDirectionsControl({ client: makeClient(), onRoute });
    const { map } = makeMap();
    const container = ctrl.onAdd(map);

    await ctrl.setWaypoints([[44.5, 40.1], [44.6, 40.2]]);

    const items = container.querySelectorAll("ol.sphyra-directions-steps li");
    expect(items.length).toBe(2);
    expect(items[0]!.textContent).toBe("Turn left");
    expect(items[1]!.textContent).toBe("Arrive");
    expect(onRoute).toHaveBeenCalledTimes(1);
  });

  it("DR4 — <2 waypoints → no directions call; route cleared with empty FC", async () => {
    const client = makeClient();
    const ctrl = new SphyraDirectionsControl({ client });
    const { map, setData } = makeMap();
    ctrl.onAdd(map);

    // Prime the source so clear() has something to setData on.
    await ctrl.setWaypoints([[44.5, 40.1], [44.6, 40.2]]);
    client.directions.mockClear();
    setData.mockClear();

    await ctrl.setWaypoints([[44.5, 40.1]]);
    expect(client.directions).not.toHaveBeenCalled();
    expect(setData).toHaveBeenCalledWith({ type: "FeatureCollection", features: [] });
  });

  it("DR5 — changing the profile <select> to 'walking' re-requests with profile:'walking'", async () => {
    const client = makeClient();
    const ctrl = new SphyraDirectionsControl({ client });
    const { map } = makeMap();
    const container = ctrl.onAdd(map);

    await ctrl.setWaypoints([[44.5, 40.1], [44.6, 40.2]]);
    client.directions.mockClear();

    const select = container.querySelector("select.sphyra-directions-profile") as HTMLSelectElement;
    select.value = "walking";
    select.dispatchEvent(new Event("change"));
    await flush();

    expect(client.directions).toHaveBeenCalledWith(expect.objectContaining({ profile: "walking" }));
  });

  it("DR6 — client.directions rejects → onError called, no throw", async () => {
    const err = new Error("route boom");
    const client = makeClient(vi.fn().mockRejectedValue(err));
    const onError = vi.fn();
    const ctrl = new SphyraDirectionsControl({ client, onError });
    const { map } = makeMap();
    ctrl.onAdd(map);

    await ctrl.setWaypoints([[44.5, 40.1], [44.6, 40.2]]);
    expect(onError).toHaveBeenCalledWith(err);
  });

  it("DR7 — onRemove removes the layer + source and the container", async () => {
    const ctrl = new SphyraDirectionsControl({ client: makeClient() });
    const { map } = makeMap();
    const container = ctrl.onAdd(map);
    document.body.appendChild(container);
    await ctrl.setWaypoints([[44.5, 40.1], [44.6, 40.2]]);

    ctrl.onRemove();
    expect(map.off).toHaveBeenCalledWith("click", expect.any(Function));
    expect(map.removeLayer).toHaveBeenCalledWith(ROUTE_LAYER_ID);
    expect(map.removeSource).toHaveBeenCalledWith(ROUTE_SOURCE_ID);
    expect(container.isConnected).toBe(false);
  });

  it("DR8 — interactive map clicks add waypoints and request a route on the second click", async () => {
    const client = makeClient();
    const ctrl = new SphyraDirectionsControl({ client, interactive: true });
    const { map } = makeMap();
    ctrl.onAdd(map);

    await ctrl.addWaypointFromMap([44.5, 40.1]);
    expect(client.directions).not.toHaveBeenCalled();

    await ctrl.addWaypointFromMap([44.6, 40.2]);
    expect(client.directions).toHaveBeenCalledTimes(1);
  });
});
