// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { addMarker, markerRemove } = vi.hoisted(() => {
  const markerRemove = vi.fn();
  return { addMarker: vi.fn(() => ({ remove: markerRemove })), markerRemove };
});
vi.mock("../../src/map/markers", () => ({ addMarker }));

import { SphyraGeocoderControl } from "../../src/controls/geocoder";
import type maplibregl from "maplibre-gl";
import type { SphyraClient } from "../../src/SphyraClient";

function makeMap() {
  return {
    getCenter: vi.fn(() => ({ lng: 44.5, lat: 40.18 })),
    flyTo: vi.fn(),
  } as unknown as maplibregl.Map & { getCenter: ReturnType<typeof vi.fn>; flyTo: ReturnType<typeof vi.fn> };
}

function makeClient(over: Partial<Record<"searchSuggest" | "searchRetrieve", unknown>> = {}) {
  return {
    searchSuggest: vi.fn().mockResolvedValue({
      suggestions: [
        { id: "poi.1", name: "Cafe X", fullName: "Cafe X, Yerevan", placeType: "cafe", category: "amenity", coordinates: [44.51, 40.19], distance: null },
      ],
      attribution: "",
    }),
    searchRetrieve: vi.fn().mockResolvedValue({
      feature: { id: "poi.1", name: "Cafe X", fullName: "Cafe X, Yerevan", placeType: "cafe", category: "amenity", coordinates: [44.51, 40.19], address: { street: null, city: "Yerevan", district: null, postalcode: null, country: "Armenia" }, boundingBox: null },
    }),
    ...over,
  } as unknown as SphyraClient & {
    searchSuggest: ReturnType<typeof vi.fn>;
    searchRetrieve: ReturnType<typeof vi.fn>;
  };
}

function typeInto(input: HTMLInputElement, value: string) {
  input.value = value;
  input.dispatchEvent(new Event("input"));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("SphyraGeocoderControl", () => {
  it("GC1 — onAdd returns a container with a text <input> (placeholder 'Search') and a <ul>", () => {
    const ctrl = new SphyraGeocoderControl({ client: makeClient() });
    const container = ctrl.onAdd(makeMap());

    const input = container.querySelector("input.sphyra-geocoder-input") as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.placeholder).toBe("Search");
    expect(container.querySelector("ul.sphyra-geocoder-suggestions")).not.toBeNull();
  });

  it("GC2 — ≥2 chars after 400ms calls searchSuggest with proximity + token; renders one <li>", async () => {
    const client = makeClient();
    const ctrl = new SphyraGeocoderControl({ client });
    const map = makeMap();
    const container = ctrl.onAdd(map);
    const input = container.querySelector("input.sphyra-geocoder-input") as HTMLInputElement;

    typeInto(input, "ca");
    await vi.advanceTimersByTimeAsync(400);

    expect(client.searchSuggest).toHaveBeenCalledTimes(1);
    const args = client.searchSuggest.mock.calls[0]![0] as { proximity?: [number, number]; sessionToken?: string };
    expect(args.proximity).toEqual([44.5, 40.18]);
    expect(typeof args.sessionToken).toBe("string");
    expect(container.querySelectorAll("ul.sphyra-geocoder-suggestions li").length).toBe(1);
  });

  it("GC3 — <2 chars → no searchSuggest, list cleared", async () => {
    const client = makeClient();
    const ctrl = new SphyraGeocoderControl({ client });
    const container = ctrl.onAdd(makeMap());
    const input = container.querySelector("input.sphyra-geocoder-input") as HTMLInputElement;

    typeInto(input, "c");
    await vi.advanceTimersByTimeAsync(400);

    expect(client.searchSuggest).not.toHaveBeenCalled();
    expect(container.querySelectorAll("ul.sphyra-geocoder-suggestions li").length).toBe(0);
  });

  it("GC4 — clicking a suggestion retrieves, flyTo + addMarker, onResult, input set, list cleared", async () => {
    const client = makeClient();
    const onResult = vi.fn();
    const ctrl = new SphyraGeocoderControl({ client, onResult });
    const map = makeMap();
    const container = ctrl.onAdd(map);
    const input = container.querySelector("input.sphyra-geocoder-input") as HTMLInputElement;

    typeInto(input, "cafe");
    await vi.advanceTimersByTimeAsync(400);

    const li = container.querySelector("ul.sphyra-geocoder-suggestions li") as HTMLLIElement;
    li.dispatchEvent(new Event("click"));
    await vi.advanceTimersByTimeAsync(0);

    expect(client.searchRetrieve).toHaveBeenCalledWith(expect.objectContaining({ id: "poi.1" }));
    expect(map.flyTo).toHaveBeenCalledWith({ center: [44.51, 40.19], zoom: 15 });
    expect(addMarker).toHaveBeenCalledWith(map, { lngLat: [44.51, 40.19] });
    expect(onResult).toHaveBeenCalledTimes(1);
    expect(input.value).toBe("Cafe X, Yerevan");
    expect(container.querySelectorAll("ul.sphyra-geocoder-suggestions li").length).toBe(0);
  });

  it("GC5 — searchSuggest rejects → onError; onRemove removes the container", async () => {
    const err = new Error("suggest boom");
    const client = makeClient({ searchSuggest: vi.fn().mockRejectedValue(err) });
    const onError = vi.fn();
    const ctrl = new SphyraGeocoderControl({ client, onError });
    const container = ctrl.onAdd(makeMap());
    document.body.appendChild(container);
    const input = container.querySelector("input.sphyra-geocoder-input") as HTMLInputElement;

    typeInto(input, "cafe");
    await vi.advanceTimersByTimeAsync(400);
    expect(onError).toHaveBeenCalledWith(err);

    ctrl.onRemove();
    expect(container.isConnected).toBe(false);
  });
});
