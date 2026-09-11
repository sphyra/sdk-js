import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDrawControl } from "../../src/controls/draw";
import type maplibregl from "maplibre-gl";

// A fake draw plugin instance + ctor (injected — no real @mapbox/mapbox-gl-draw install).
function makeDrawInstance() {
  return {
    getAll: vi.fn(() => ({ type: "FeatureCollection", features: [] }) as GeoJSON.FeatureCollection),
    deleteAll: vi.fn(),
    changeMode: vi.fn(),
    onAdd: vi.fn(),
    onRemove: vi.fn(),
  };
}

function makeMap(handlers: Record<string, (e?: unknown) => void>) {
  return {
    addControl: vi.fn(),
    removeControl: vi.fn(),
    on: vi.fn((ev: string, cb: (e?: unknown) => void) => {
      handlers[ev] = cb;
    }),
    off: vi.fn(),
  } as unknown as maplibregl.Map & {
    addControl: ReturnType<typeof vi.fn>;
    removeControl: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
    off: ReturnType<typeof vi.fn>;
  };
}

let handlers: Record<string, (e?: unknown) => void>;

beforeEach(() => {
  handlers = {};
  vi.clearAllMocks();
});

describe("controls/draw", () => {
  it("D1 — constructs draw plugin with drawOptions and addControl(draw, 'top-left')", () => {
    const draw = makeDrawInstance();
    const DrawCtor = vi.fn(() => draw);
    const map = makeMap(handlers);

    const handle = createDrawControl(map, { DrawCtor, drawOptions: { displayControlsDefault: false } });

    expect(DrawCtor).toHaveBeenCalledWith({ displayControlsDefault: false });
    expect(map.addControl).toHaveBeenCalledWith(draw, "top-left");
    expect(handle.draw).toBe(draw);
  });

  it("D2 — wires create/update/delete → onChange(getAll()); no onChange → no map.on", () => {
    const draw = makeDrawInstance();
    const fc: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [44.5, 40.1] } }],
    };
    draw.getAll.mockReturnValue(fc);
    const onChange = vi.fn();
    const map = makeMap(handlers);

    createDrawControl(map, { DrawCtor: vi.fn(() => draw), onChange });

    expect(map.on).toHaveBeenCalledTimes(3);
    handlers["draw.create"]!();
    expect(onChange).toHaveBeenLastCalledWith(fc);
    handlers["draw.update"]!();
    handlers["draw.delete"]!();
    expect(onChange).toHaveBeenCalledTimes(3);

    // No onChange → no listeners.
    vi.clearAllMocks();
    const map2 = makeMap(handlers);
    createDrawControl(map2, { DrawCtor: vi.fn(() => makeDrawInstance()) });
    expect(map2.on).not.toHaveBeenCalled();
  });

  it("D3 — startDrawing maps point/line/polygon to draw modes", () => {
    const draw = makeDrawInstance();
    const map = makeMap(handlers);
    const handle = createDrawControl(map, { DrawCtor: vi.fn(() => draw) });

    handle.startDrawing("polygon");
    expect(draw.changeMode).toHaveBeenLastCalledWith("draw_polygon");
    handle.startDrawing("point");
    expect(draw.changeMode).toHaveBeenLastCalledWith("draw_point");
    handle.startDrawing("line");
    expect(draw.changeMode).toHaveBeenLastCalledWith("draw_line_string");
  });

  it("D4 — getFeatures() → draw.getAll(); deleteAll() → draw.deleteAll()", () => {
    const draw = makeDrawInstance();
    const fc: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
    draw.getAll.mockReturnValue(fc);
    const map = makeMap(handlers);
    const handle = createDrawControl(map, { DrawCtor: vi.fn(() => draw) });

    expect(handle.getFeatures()).toBe(fc);
    handle.deleteAll();
    expect(draw.deleteAll).toHaveBeenCalledTimes(1);
  });

  it("D5 — remove() unwires the 3 listeners (when onChange set) + removeControl(draw)", () => {
    const draw = makeDrawInstance();
    const map = makeMap(handlers);
    const handle = createDrawControl(map, { DrawCtor: vi.fn(() => draw), onChange: vi.fn() });

    handle.remove();
    expect(map.off).toHaveBeenCalledTimes(3);
    expect(map.removeControl).toHaveBeenCalledWith(draw);
  });
});
