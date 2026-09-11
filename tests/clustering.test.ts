import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("maplibre-gl", () => ({ default: {} }));

import { addClusterSource } from "../src/map/clustering";

interface MapSpy {
  addSource: ReturnType<typeof vi.fn>;
  addLayer: ReturnType<typeof vi.fn>;
  getSource: ReturnType<typeof vi.fn>;
  removeLayer: ReturnType<typeof vi.fn>;
  removeSource: ReturnType<typeof vi.fn>;
  easeTo: ReturnType<typeof vi.fn>;
  getCanvas: ReturnType<typeof vi.fn>;
  queryRenderedFeatures: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
}

let clickHandlers: Record<string, (e?: unknown) => void>;
let otherHandlers: Record<string, (e?: unknown) => void>;
let sourceStub: { setData: ReturnType<typeof vi.fn>; getClusterExpansionZoom: ReturnType<typeof vi.fn> };
let canvasStyle: { cursor: string };

function makeMap(): MapSpy {
  clickHandlers = {};
  otherHandlers = {};
  canvasStyle = { cursor: "init" };
  sourceStub = {
    setData: vi.fn(),
    getClusterExpansionZoom: vi.fn().mockResolvedValue(8),
  };
  return {
    addSource: vi.fn(),
    addLayer: vi.fn(),
    getSource: vi.fn(() => sourceStub),
    removeLayer: vi.fn(),
    removeSource: vi.fn(),
    easeTo: vi.fn(),
    getCanvas: vi.fn(() => ({ style: canvasStyle })),
    queryRenderedFeatures: vi.fn(),
    on: vi.fn((type: string, layerOrCb: unknown, cb?: (e?: unknown) => void) => {
      if (typeof layerOrCb === "string" && cb) {
        if (type === "click") clickHandlers[layerOrCb] = cb;
        else otherHandlers[`${type}:${layerOrCb}`] = cb;
      } else if (typeof layerOrCb === "function") {
        otherHandlers[type] = layerOrCb as (e?: unknown) => void;
      }
    }),
  };
}

const fc = { type: "FeatureCollection", features: [] } as unknown as GeoJSON.FeatureCollection;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("addClusterSource", () => {
  it("CL1 — adds a clustered geojson source + 3 layers with the right ids/filters", () => {
    const map = makeMap();
    const handle = addClusterSource(map as never, "pts", { data: fc });

    expect(map.addSource).toHaveBeenCalledWith(
      "pts",
      expect.objectContaining({
        type: "geojson",
        data: fc,
        cluster: true,
        clusterRadius: 50,
        clusterMaxZoom: 14,
      }),
    );

    const layerIds = map.addLayer.mock.calls.map((c) => (c[0] as { id: string }).id);
    expect(layerIds).toEqual(["pts-clusters", "pts-cluster-count", "pts-unclustered"]);

    const clusters = map.addLayer.mock.calls[0]![0] as { filter: unknown };
    const unclustered = map.addLayer.mock.calls[2]![0] as { filter: unknown };
    expect(clusters.filter).toEqual(["has", "point_count"]);
    expect(unclustered.filter).toEqual(["!", ["has", "point_count"]]);

    expect(handle.sourceId).toBe("pts");
    expect(handle.layerIds).toEqual({
      clusters: "pts-clusters",
      clusterCount: "pts-cluster-count",
      unclustered: "pts-unclustered",
    });
  });

  it("CL2 — custom radius/maxZoom/colors flow through", () => {
    const map = makeMap();
    addClusterSource(map as never, "p", {
      data: fc,
      clusterRadius: 80,
      clusterMaxZoom: 10,
      clusterColor: "#abc",
      clusterTextColor: "#def",
      pointColor: "#123",
      pointRadius: 9,
    });

    expect(map.addSource).toHaveBeenCalledWith(
      "p",
      expect.objectContaining({ clusterRadius: 80, clusterMaxZoom: 10 }),
    );
    const clusters = map.addLayer.mock.calls[0]![0] as { paint: Record<string, unknown> };
    const count = map.addLayer.mock.calls[1]![0] as { paint: Record<string, unknown> };
    const unclustered = map.addLayer.mock.calls[2]![0] as { paint: Record<string, unknown> };
    expect(clusters.paint["circle-color"]).toBe("#abc");
    expect(count.paint["text-color"]).toBe("#def");
    expect(unclustered.paint["circle-color"]).toBe("#123");
    expect(unclustered.paint["circle-radius"]).toBe(9);
  });

  it("CL3 — cluster click → getClusterExpansionZoom → easeTo", async () => {
    const map = makeMap();
    addClusterSource(map as never, "pts", { data: fc });

    map.queryRenderedFeatures.mockReturnValue([
      { properties: { cluster_id: 7 }, geometry: { type: "Point", coordinates: [44.5, 40.18] } },
    ]);

    clickHandlers["pts-clusters"]!({ point: {} });
    await Promise.resolve();
    await Promise.resolve();

    expect(sourceStub.getClusterExpansionZoom).toHaveBeenCalledWith(7);
    expect(map.easeTo).toHaveBeenCalledWith({ center: [44.5, 40.18], zoom: 8 });
  });

  it("CL4 — onPointClick fires for unclustered click with feature + coords", () => {
    const map = makeMap();
    const onPointClick = vi.fn();
    addClusterSource(map as never, "pts", { data: fc, onPointClick });

    const feature = {
      properties: { id: 1 },
      geometry: { type: "Point", coordinates: [44.5, 40.18] },
    };
    map.queryRenderedFeatures.mockReturnValue([feature]);

    clickHandlers["pts-unclustered"]!({ point: {} });
    expect(onPointClick).toHaveBeenCalledWith(feature, [44.5, 40.18]);
  });

  it("CL5 — setData calls source.setData; remove() removes 3 layers + the source", () => {
    const map = makeMap();
    const handle = addClusterSource(map as never, "pts", { data: fc });

    handle.setData(fc);
    expect(sourceStub.setData).toHaveBeenCalledWith(fc);

    handle.remove();
    expect(map.removeLayer).toHaveBeenCalledTimes(3);
    expect(map.removeLayer.mock.calls.map((c) => c[0])).toEqual([
      "pts-clusters",
      "pts-cluster-count",
      "pts-unclustered",
    ]);
    expect(map.removeSource).toHaveBeenCalledWith("pts");
  });
});
