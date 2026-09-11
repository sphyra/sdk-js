import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SphyraClient } from "../src/SphyraClient";
import { SphyraError } from "../src/errors";

const BASE = "http://127.0.0.1:4000";
const KEY = "test-key";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** Pull the [url, init] of the Nth fetch call (0-based). */
function callArgs(n = 0): [string, RequestInit] {
  const call = fetchMock.mock.calls[n];
  return [String(call[0]), (call[1] ?? {}) as RequestInit];
}

function authHeader(init: RequestInit): string | undefined {
  const h = init.headers as Record<string, string> | undefined;
  return h?.["Authorization"];
}

describe("SphyraClient", () => {
  describe("reverseGeocode", () => {
    const fixture = {
      displayName: "Yerevan, Armenia",
      city: "Yerevan",
      district: "Kentron",
      street: "Abovyan",
      country: "Armenia",
      lat: 40.1872,
      lon: 44.5152,
    };

    it("case 1 — happy path: POSTs to correct URL with Bearer + JSON body", async () => {
      fetchMock.mockResolvedValue(jsonResponse(fixture));
      const client = new SphyraClient({ baseUrl: BASE, apiKey: KEY });

      const result = await client.reverseGeocode({ lat: 40.1872, lon: 44.5152, lang: "en" });

      expect(result).toEqual(fixture);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = callArgs();
      expect(url).toBe(`${BASE}/api/v1/geocode/reverse`);
      expect(init.method).toBe("POST");
      expect(authHeader(init)).toBe(`Bearer ${KEY}`);
      expect(JSON.parse(String(init.body))).toEqual({ lat: 40.1872, lon: 44.5152, lang: "en" });
    });

    it("case 2 — defaults lang to 'hy' when omitted", async () => {
      fetchMock.mockResolvedValue(jsonResponse(fixture));
      const client = new SphyraClient({ baseUrl: BASE, apiKey: KEY });

      await client.reverseGeocode({ lat: 40.1872, lon: 44.5152 });

      const [, init] = callArgs();
      expect(JSON.parse(String(init.body)).lang).toBe("hy");
    });
  });

  describe("forwardGeocode", () => {
    const fixture = [
      {
        displayName: "Yerevan, Armenia",
        lat: 40.1792,
        lon: 44.4991,
        boundingBox: [40.0, 40.3, 44.3, 44.7] as [number, number, number, number],
        type: "city",
      },
    ];

    it("case 3 — happy path: GETs search with q only; omits lang/limit when not passed", async () => {
      fetchMock.mockResolvedValue(jsonResponse(fixture));
      const client = new SphyraClient({ baseUrl: BASE, apiKey: KEY });

      const result = await client.forwardGeocode({ q: "Yerevan" });

      expect(result).toEqual(fixture);
      const [url, init] = callArgs();
      expect(url).toBe(`${BASE}/api/v1/geocode/search?q=Yerevan`);
      expect(init.method).toBe("GET");
      expect(authHeader(init)).toBe(`Bearer ${KEY}`);
    });

    it("case 3b — includes lang and limit when provided", async () => {
      fetchMock.mockResolvedValue(jsonResponse(fixture));
      const client = new SphyraClient({ baseUrl: BASE, apiKey: KEY });

      await client.forwardGeocode({ q: "Abovyan", lang: "hy", limit: 5 });

      const [url] = callArgs();
      const parsed = new URL(url);
      expect(parsed.pathname).toBe("/api/v1/geocode/search");
      expect(parsed.searchParams.get("q")).toBe("Abovyan");
      expect(parsed.searchParams.get("lang")).toBe("hy");
      expect(parsed.searchParams.get("limit")).toBe("5");
    });
  });

  describe("getTileConfig", () => {
    it("case 4 — returns TileConfigResponse incl. tileUrlTemplate", async () => {
      const fixture = {
        tileUrlTemplate: "http://127.0.0.1:4000/tiles/{z}/{x}/{y}?sig=abc",
        styleUrl: "http://127.0.0.1:4000/api/v1/map-style.json",
        expiresAt: 1_700_000_000,
        attribution: "© OpenStreetMap contributors",
      };
      fetchMock.mockResolvedValue(jsonResponse(fixture));
      const client = new SphyraClient({ baseUrl: BASE, apiKey: KEY });

      const result = await client.getTileConfig();

      expect(result).toEqual(fixture);
      expect(result.tileUrlTemplate).toBe(fixture.tileUrlTemplate);
      const [url, init] = callArgs();
      expect(url).toBe(`${BASE}/api/v1/tile-config`);
      expect(init.method ?? "GET").toBe("GET");
    });
  });

  describe("healthCheck", () => {
    it("case 5 — hits top-level /health and extracts status", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          status: "ok",
          version: "1.0.0",
          services: { martin: "ok", nominatim: "ok", redis: "ok" },
        }),
      );
      const client = new SphyraClient({ baseUrl: BASE, apiKey: KEY });

      const result = await client.healthCheck();

      expect(result).toEqual({ status: "ok" });
      const [url] = callArgs();
      expect(url).toBe(`${BASE}/health`);
    });
  });

  describe("retry & errors", () => {
    it("case 6 — 5xx retries three times then throws SphyraError (4 fetch calls)", async () => {
      vi.useFakeTimers();
      fetchMock.mockResolvedValue(
        jsonResponse({ error: { code: "UPSTREAM", message: "boom" } }, 503),
      );
      const client = new SphyraClient({ baseUrl: BASE, apiKey: KEY });

      // Attach the rejection handler synchronously so the rejection is never
      // "unhandled", then advance the 1s/2s/4s backoff timers to completion.
      const errPromise = client.getTileConfig().catch((e) => e);
      await vi.runAllTimersAsync();
      const err = await errPromise;

      expect(err).toBeInstanceOf(SphyraError);
      expect((err as SphyraError).statusCode).toBe(503);
      expect(fetchMock).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
    });

    it("case 7 — timeout/abort throws SphyraError code TIMEOUT", async () => {
      // A TIMEOUT error is retryable (spec §4.4), so a persistent timeout retries
      // 3× over 1s/2s/4s backoff — drive fake timers so the test does not wait 7s.
      vi.useFakeTimers();
      fetchMock.mockImplementation(() =>
        Promise.reject(Object.assign(new Error("aborted"), { name: "TimeoutError" })),
      );
      const client = new SphyraClient({ baseUrl: BASE, apiKey: KEY, timeout: 10 });

      const errPromise = client.healthCheck().catch((e) => e);
      await vi.runAllTimersAsync();
      const err = await errPromise;

      expect(err).toBeInstanceOf(SphyraError);
      expect((err as SphyraError).code).toBe("TIMEOUT");
      expect(fetchMock).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
    });

    it("case 8 — 4xx is NOT retried; throws immediately with envelope code", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ error: { code: "INVALID_API_KEY", message: "Invalid API key" } }, 401),
      );
      const client = new SphyraClient({ baseUrl: BASE, apiKey: KEY });

      const err = await client.getTileConfig().catch((e) => e);
      expect(err).toBeInstanceOf(SphyraError);
      expect((err as SphyraError).code).toBe("INVALID_API_KEY");
      expect((err as SphyraError).statusCode).toBe(401);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("directions", () => {
    const waypoints: [number, number][] = [
      [44.5152, 40.1872],
      [44.5126, 40.1772],
    ];
    const result = {
      routes: [
        {
          geometry: {
            type: "LineString",
            coordinates: [
              [44.5152, 40.1872],
              [44.5126, 40.1772],
            ],
          },
          distance: 1234,
          duration: 95,
          legs: [
            {
              distance: 1234,
              duration: 95,
              steps: [
                {
                  maneuver: { type: 1, instruction: "Drive south.", location: [44.5152, 40.1872] },
                  name: "Mashtots Avenue",
                  distance: 420,
                  duration: 33,
                },
              ],
            },
          ],
        },
      ],
      waypoints: [
        { location: [44.5152, 40.1872], name: "" },
        { location: [44.5126, 40.1772], name: "" },
      ],
    };

    it("case 9 — happy path: POSTs to /api/v1/directions with Bearer + full body", async () => {
      fetchMock.mockResolvedValue(jsonResponse(result));
      const client = new SphyraClient({ baseUrl: BASE, apiKey: KEY });

      const out = await client.directions({
        waypoints,
        profile: "walking",
        alternatives: true,
        steps: false,
        language: "en",
        geometries: "polyline",
      });

      expect(out).toEqual(result);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = callArgs();
      expect(url).toBe(`${BASE}/api/v1/directions`);
      expect(init.method).toBe("POST");
      expect(authHeader(init)).toBe(`Bearer ${KEY}`);
      expect(JSON.parse(String(init.body))).toEqual({
        waypoints,
        profile: "walking",
        alternatives: true,
        steps: false,
        language: "en",
        geometries: "polyline",
      });
    });

    it("case 10 — omits optional params when not provided (waypoints only)", async () => {
      fetchMock.mockResolvedValue(jsonResponse(result));
      const client = new SphyraClient({ baseUrl: BASE, apiKey: KEY });

      await client.directions({ waypoints });

      const [, init] = callArgs();
      expect(JSON.parse(String(init.body))).toEqual({ waypoints });
    });

    it("case 11 — 422 NO_ROUTE rejects with SphyraError carrying code + statusCode", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ error: { code: "NO_ROUTE", message: "No route found" } }, 422),
      );
      const client = new SphyraClient({ baseUrl: BASE, apiKey: KEY });

      const err = await client.directions({ waypoints }).catch((e) => e);
      expect(err).toBeInstanceOf(SphyraError);
      expect((err as SphyraError).code).toBe("NO_ROUTE");
      expect((err as SphyraError).statusCode).toBe(422);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("matrix", () => {
    const sources: [number, number][] = [
      [44.5152, 40.1872],
      [44.514, 40.182],
    ];
    const targets: [number, number][] = [
      [44.5152, 40.1872],
      [44.5126, 40.1772],
    ];
    const result = {
      durations: [
        [0, 95],
        [88, 0],
      ],
      distances: [
        [0, 1234],
        [1118, 0],
      ],
      sources,
      targets,
    };

    it("case 12 — happy path: POSTs to /api/v1/matrix with Bearer + full body", async () => {
      fetchMock.mockResolvedValue(jsonResponse(result));
      const client = new SphyraClient({ baseUrl: BASE, apiKey: KEY });

      const out = await client.matrix({
        sources,
        targets,
        profile: "walking",
        annotations: "duration",
      });

      expect(out).toEqual(result);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = callArgs();
      expect(url).toBe(`${BASE}/api/v1/matrix`);
      expect(init.method).toBe("POST");
      expect(authHeader(init)).toBe(`Bearer ${KEY}`);
      expect(JSON.parse(String(init.body))).toEqual({
        sources,
        targets,
        profile: "walking",
        annotations: "duration",
      });
    });

    it("case 13 — omits optional params when not provided (sources + targets only)", async () => {
      fetchMock.mockResolvedValue(jsonResponse(result));
      const client = new SphyraClient({ baseUrl: BASE, apiKey: KEY });

      await client.matrix({ sources, targets });

      const [, init] = callArgs();
      expect(JSON.parse(String(init.body))).toEqual({ sources, targets });
    });

    it("case 14 — 422 NO_MATRIX rejects with SphyraError carrying code + statusCode", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ error: { code: "NO_MATRIX", message: "No matrix found" } }, 422),
      );
      const client = new SphyraClient({ baseUrl: BASE, apiKey: KEY });

      const err = await client.matrix({ sources, targets }).catch((e) => e);
      expect(err).toBeInstanceOf(SphyraError);
      expect((err as SphyraError).code).toBe("NO_MATRIX");
      expect((err as SphyraError).statusCode).toBe(422);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("isochrone", () => {
    const origin: [number, number] = [44.5152, 40.1872];
    const result = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {
            contour: 5,
            metric: "time",
            color: "#ff0000",
            opacity: 0.33,
            fill: "#ff0000",
            fillOpacity: 0.33,
          },
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [44.51, 40.18],
                [44.52, 40.18],
                [44.52, 40.19],
                [44.51, 40.18],
              ],
            ],
          },
        },
      ],
    };

    it("case 15 — happy path: POSTs to /api/v1/isochrone with Bearer + full body", async () => {
      fetchMock.mockResolvedValue(jsonResponse(result));
      const client = new SphyraClient({ baseUrl: BASE, apiKey: KEY });

      const out = await client.isochrone({
        origin,
        profile: "walking",
        contoursMinutes: [5, 10],
        contoursMeters: [2000],
        contoursColors: ["ff0000", "00ff00", "0000ff"],
        polygons: false,
        denoise: 0.5,
        generalize: 150,
      });

      expect(out).toEqual(result);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = callArgs();
      expect(url).toBe(`${BASE}/api/v1/isochrone`);
      expect(init.method).toBe("POST");
      expect(authHeader(init)).toBe(`Bearer ${KEY}`);
      expect(JSON.parse(String(init.body))).toEqual({
        origin,
        profile: "walking",
        contoursMinutes: [5, 10],
        contoursMeters: [2000],
        contoursColors: ["ff0000", "00ff00", "0000ff"],
        polygons: false,
        denoise: 0.5,
        generalize: 150,
      });
    });

    it("case 16 — omits optional params when not provided (origin + contours only)", async () => {
      fetchMock.mockResolvedValue(jsonResponse(result));
      const client = new SphyraClient({ baseUrl: BASE, apiKey: KEY });

      await client.isochrone({ origin, contoursMinutes: [5] });

      const [, init] = callArgs();
      expect(JSON.parse(String(init.body))).toEqual({ origin, contoursMinutes: [5] });
    });

    it("case 17 — 422 NO_ISOCHRONE rejects with SphyraError carrying code + statusCode", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ error: { code: "NO_ISOCHRONE", message: "No isochrone found" } }, 422),
      );
      const client = new SphyraClient({ baseUrl: BASE, apiKey: KEY });

      const err = await client.isochrone({ origin, contoursMinutes: [5] }).catch((e) => e);
      expect(err).toBeInstanceOf(SphyraError);
      expect((err as SphyraError).code).toBe("NO_ISOCHRONE");
      expect((err as SphyraError).statusCode).toBe(422);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("mapMatch", () => {
    const coordinates: [number, number][] = [
      [44.5152, 40.1872],
      [44.5126, 40.1772],
    ];
    const result = {
      geometry: {
        type: "LineString",
        coordinates: [
          [44.5152, 40.1872],
          [44.5126, 40.1772],
        ],
      },
      confidence: 0.934,
      distance: 1234,
      duration: 95,
      tracepoints: [
        {
          location: [44.5152, 40.1872],
          name: "Mashtots Avenue",
          matchingsIndex: 0,
          waypointIndex: 0,
          type: "matched",
          distanceFromTrace: 2.5,
        },
        {
          location: [44.5126, 40.1772],
          name: "Tigran Mets Avenue",
          matchingsIndex: 0,
          waypointIndex: 1,
          type: "matched",
          distanceFromTrace: 4.1,
        },
      ],
      legs: [{ distance: 1234, duration: 95, steps: [] }],
    };

    it("case 18 — happy path: POSTs to /api/v1/map-matching with Bearer + full body", async () => {
      fetchMock.mockResolvedValue(jsonResponse(result));
      const client = new SphyraClient({ baseUrl: BASE, apiKey: KEY });

      const out = await client.mapMatch({
        coordinates,
        timestamps: [100, 200],
        radiuses: [5, 6],
        profile: "walking",
        tidy: true,
        geometries: "polyline",
        language: "en",
        steps: true,
      });

      expect(out).toEqual(result);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = callArgs();
      expect(url).toBe(`${BASE}/api/v1/map-matching`);
      expect(init.method).toBe("POST");
      expect(authHeader(init)).toBe(`Bearer ${KEY}`);
      expect(JSON.parse(String(init.body))).toEqual({
        coordinates,
        timestamps: [100, 200],
        radiuses: [5, 6],
        profile: "walking",
        tidy: true,
        geometries: "polyline",
        language: "en",
        steps: true,
      });
    });

    it("case 19 — omits optional params when not provided (coordinates only)", async () => {
      fetchMock.mockResolvedValue(jsonResponse(result));
      const client = new SphyraClient({ baseUrl: BASE, apiKey: KEY });

      await client.mapMatch({ coordinates });

      const [, init] = callArgs();
      expect(JSON.parse(String(init.body))).toEqual({ coordinates });
    });

    it("case 20 — 422 NO_MATCH rejects with SphyraError carrying code + statusCode", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ error: { code: "NO_MATCH", message: "No match found" } }, 422),
      );
      const client = new SphyraClient({ baseUrl: BASE, apiKey: KEY });

      const err = await client.mapMatch({ coordinates }).catch((e) => e);
      expect(err).toBeInstanceOf(SphyraError);
      expect((err as SphyraError).code).toBe("NO_MATCH");
      expect((err as SphyraError).statusCode).toBe(422);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("optimize", () => {
    const waypoints: [number, number][] = [
      [44.5152, 40.1872],
      [44.5126, 40.1772],
      [44.5, 40.17],
    ];
    const result = {
      waypoints: [
        { location: [44.5152, 40.1872], name: "", waypointIndex: 0, tripsIndex: 0 },
        { location: [44.5126, 40.1772], name: "", waypointIndex: 2, tripsIndex: 0 },
        { location: [44.5, 40.17], name: "", waypointIndex: 1, tripsIndex: 0 },
      ],
      trips: [
        {
          geometry: {
            type: "LineString",
            coordinates: [
              [44.5152, 40.1872],
              [44.5126, 40.1772],
            ],
          },
          distance: 5400,
          duration: 600,
          legs: [{ distance: 1234, duration: 95, steps: [] }],
        },
      ],
    };

    it("case 21 — happy path: POSTs to /api/v1/optimization with Bearer + full body", async () => {
      fetchMock.mockResolvedValue(jsonResponse(result));
      const client = new SphyraClient({ baseUrl: BASE, apiKey: KEY });

      const out = await client.optimize({
        waypoints,
        profile: "walking",
        source: "any",
        destination: "any",
        roundtrip: true,
        geometries: "polyline",
        language: "en",
        steps: true,
      });

      expect(out).toEqual(result);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = callArgs();
      expect(url).toBe(`${BASE}/api/v1/optimization`);
      expect(init.method).toBe("POST");
      expect(authHeader(init)).toBe(`Bearer ${KEY}`);
      expect(JSON.parse(String(init.body))).toEqual({
        waypoints,
        profile: "walking",
        source: "any",
        destination: "any",
        roundtrip: true,
        geometries: "polyline",
        language: "en",
        steps: true,
      });
    });

    it("case 22 — omits optional params when not provided (waypoints only)", async () => {
      fetchMock.mockResolvedValue(jsonResponse(result));
      const client = new SphyraClient({ baseUrl: BASE, apiKey: KEY });

      await client.optimize({ waypoints });

      const [, init] = callArgs();
      expect(JSON.parse(String(init.body))).toEqual({ waypoints });
    });

    it("case 23 — 422 NO_TRIPS rejects with SphyraError carrying code + statusCode", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ error: { code: "NO_TRIPS", message: "No optimized trip found" } }, 422),
      );
      const client = new SphyraClient({ baseUrl: BASE, apiKey: KEY });

      const err = await client.optimize({ waypoints }).catch((e) => e);
      expect(err).toBeInstanceOf(SphyraError);
      expect((err as SphyraError).code).toBe("NO_TRIPS");
      expect((err as SphyraError).statusCode).toBe(422);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("tilequery", () => {
    const result = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [44.515, 40.186] },
          properties: { name: "Cafe", amenity: "cafe", tilequery: { distance: 8, layer: "pois", geometry: "point" } },
        },
      ],
    };

    it("case 24 — happy path: GETs tilequery with position + query string + Bearer", async () => {
      fetchMock.mockResolvedValue(jsonResponse(result));
      const client = new SphyraClient({ baseUrl: BASE, apiKey: KEY });

      const out = await client.tilequery({
        lon: 44.51,
        lat: 40.18,
        radius: 100,
        limit: 3,
        layers: ["roads", "pois"],
        dedupe: false,
      });

      expect(out).toEqual(result);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = callArgs();
      expect(url).toBe(`${BASE}/api/v1/tilequery/44.51,40.18?radius=100&limit=3&layers=roads%2Cpois&dedupe=false`);
      expect(init.method).toBe("GET");
      expect(authHeader(init)).toBe(`Bearer ${KEY}`);
    });

    it("case 25 — minimal: GETs tilequery with no query string when only lon/lat given", async () => {
      fetchMock.mockResolvedValue(jsonResponse(result));
      const client = new SphyraClient({ baseUrl: BASE, apiKey: KEY });

      await client.tilequery({ lon: 44.51, lat: 40.18 });

      const [url] = callArgs();
      expect(url).toBe(`${BASE}/api/v1/tilequery/44.51,40.18`);
    });

    it("case 26 — 400 OUT_OF_BOUNDS rejects with SphyraError carrying code", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ error: { code: "OUT_OF_BOUNDS", message: "Point must be within Armenia" } }, 400),
      );
      const client = new SphyraClient({ baseUrl: BASE, apiKey: KEY });

      const err = await client.tilequery({ lon: 10, lat: 10 }).catch((e) => e);
      expect(err).toBeInstanceOf(SphyraError);
      expect((err as SphyraError).code).toBe("OUT_OF_BOUNDS");
      expect((err as SphyraError).statusCode).toBe(400);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("search", () => {
    const suggestResult = {
      suggestions: [
        {
          id: "N240109189",
          name: "Green Bean",
          fullName: "Green Bean, Mashtots Avenue, Yerevan",
          placeType: "cafe",
          category: "amenity",
          coordinates: [44.512, 40.183] as [number, number],
          distance: 40.1,
        },
      ],
      attribution: "© OpenStreetMap contributors",
    };
    const retrieveResult = {
      feature: {
        id: "N1",
        name: "Looked Up",
        fullName: "Looked Up, Yerevan",
        placeType: "cafe",
        category: "amenity",
        coordinates: [44.5, 40.18] as [number, number],
        address: { street: null, city: "Yerevan", district: null, postalcode: null, country: "Armenia" },
        boundingBox: null,
      },
    };
    const categoryResult = {
      category: "cafe" as const,
      pois: [{ id: "N10", name: "Coffeeshop", category: "cafe" as const, coordinates: [44.515, 40.186] as [number, number], distance: 80 }],
      attribution: "© OpenStreetMap contributors",
    };
    const forwardResult = {
      features: [retrieveResult.feature],
      attribution: "© OpenStreetMap contributors",
    };

    it("case 27 — searchSuggest happy path: GETs suggest with all params + Bearer", async () => {
      fetchMock.mockResolvedValue(jsonResponse(suggestResult));
      const client = new SphyraClient({ baseUrl: BASE, apiKey: KEY });

      const out = await client.searchSuggest({
        q: "Yer",
        lang: "hy",
        limit: 3,
        proximity: [44.51, 40.18],
        sessionToken: "ABC",
      });

      expect(out).toEqual(suggestResult);
      const [url, init] = callArgs();
      expect(url).toBe(`${BASE}/api/v1/search/suggest?q=Yer&lang=hy&limit=3&proximity=44.51%2C40.18&session_token=ABC`);
      expect(init.method).toBe("GET");
      expect(authHeader(init)).toBe(`Bearer ${KEY}`);
    });

    it("case 28 — searchSuggest minimal: GETs suggest with q only", async () => {
      fetchMock.mockResolvedValue(jsonResponse(suggestResult));
      const client = new SphyraClient({ baseUrl: BASE, apiKey: KEY });

      await client.searchSuggest({ q: "Yer" });

      const [url] = callArgs();
      expect(url).toBe(`${BASE}/api/v1/search/suggest?q=Yer`);
    });

    it("case 29 — searchRetrieve: GETs retrieve with id + session_token; 404 rejects with NOT_FOUND", async () => {
      fetchMock.mockResolvedValue(jsonResponse(retrieveResult));
      const client = new SphyraClient({ baseUrl: BASE, apiKey: KEY });

      const out = await client.searchRetrieve({ id: "N1", sessionToken: "ABC" });
      expect(out).toEqual(retrieveResult);
      const [url, init] = callArgs();
      expect(url).toBe(`${BASE}/api/v1/search/retrieve?id=N1&session_token=ABC`);
      expect(init.method).toBe("GET");

      fetchMock.mockResolvedValue(
        jsonResponse({ error: { code: "NOT_FOUND", message: "Not found" } }, 404),
      );
      const err = await client.searchRetrieve({ id: "N404" }).catch((e) => e);
      expect(err).toBeInstanceOf(SphyraError);
      expect((err as SphyraError).code).toBe("NOT_FOUND");
    });

    it("case 30 — searchCategory: GETs category with proximity + limit", async () => {
      fetchMock.mockResolvedValue(jsonResponse(categoryResult));
      const client = new SphyraClient({ baseUrl: BASE, apiKey: KEY });

      const out = await client.searchCategory({ category: "cafe", proximity: [44.51, 40.18], limit: 5 });

      expect(out).toEqual(categoryResult);
      const [url, init] = callArgs();
      expect(url).toBe(`${BASE}/api/v1/search/category?category=cafe&proximity=44.51%2C40.18&limit=5`);
      expect(init.method).toBe("GET");
    });

    it("case 31 — searchForward: GETs forward with structured params", async () => {
      fetchMock.mockResolvedValue(jsonResponse(forwardResult));
      const client = new SphyraClient({ baseUrl: BASE, apiKey: KEY });

      const out = await client.searchForward({ street: "Mashtots", city: "Yerevan" });

      expect(out).toEqual(forwardResult);
      const [url, init] = callArgs();
      expect(url).toBe(`${BASE}/api/v1/search/forward?street=Mashtots&city=Yerevan`);
      expect(init.method).toBe("GET");
    });
  });

  describe("getMapStyle", () => {
    const style = { version: 8, layers: [], metadata: { "sphyra:presets": {}, "sphyra:modes": {} } };

    it("case G1 — fetches the style endpoint (no query) with the Bearer key", async () => {
      fetchMock.mockResolvedValue(jsonResponse(style));
      const client = new SphyraClient({ baseUrl: BASE, apiKey: KEY });

      await client.getMapStyle();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = callArgs();
      expect(url).toBe(`${BASE}/api/v1/map-style.json`);
      expect(init.method ?? "GET").toBe("GET");
      expect(authHeader(init)).toBe(`Bearer ${KEY}`);
    });

    it("case G2 — passes preset/mode query when given", async () => {
      fetchMock.mockResolvedValue(jsonResponse(style));
      const client = new SphyraClient({ baseUrl: BASE, apiKey: KEY });

      await client.getMapStyle({ preset: "night", mode: "2d" });

      const [url] = callArgs();
      const parsed = new URL(url);
      expect(parsed.pathname).toBe("/api/v1/map-style.json");
      expect(parsed.searchParams.get("preset")).toBe("night");
      expect(parsed.searchParams.get("mode")).toBe("2d");
    });

    it("case G3 — returns the parsed style JSON", async () => {
      fetchMock.mockResolvedValue(jsonResponse(style));
      const client = new SphyraClient({ baseUrl: BASE, apiKey: KEY });

      const out = await client.getMapStyle();

      expect((out as { version: number }).version).toBe(8);
    });

    it("case G4 — baseUrl getter + authHeaders() expose the (non-secret) base and Bearer header", () => {
      const client = new SphyraClient({ baseUrl: BASE, apiKey: KEY });

      expect(client.baseUrl).toBe(BASE);
      expect(client.authHeaders()).toEqual({ Authorization: `Bearer ${KEY}` });
    });
  });

  describe("staticImageUrl", () => {
    it("returns full URL with baseUrl prefix", () => {
      const client = new SphyraClient({ baseUrl: BASE, apiKey: KEY });

      const url = client.staticImageUrl({
        position: { kind: "center", lon: 44.51, lat: 40.18, zoom: 12 },
        width: 256,
        height: 256,
      });

      expect(url).toBe(`${BASE}/api/v1/static/44.51,40.18,12/256x256.png`);
    });
  });

  describe("fetchStaticImage", () => {
    it("happy path: Bearer + Accept image/png, returns Blob", async () => {
      const fakePng = new Blob([new Uint8Array([137, 80, 78])], { type: "image/png" });
      fetchMock.mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(fakePng),
      });
      const client = new SphyraClient({ baseUrl: BASE, apiKey: KEY });

      const blob = await client.fetchStaticImage({
        position: { kind: "center", lon: 44.51, lat: 40.18, zoom: 12 },
        width: 128,
        height: 128,
      });

      expect(blob).toBe(fakePng);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = callArgs();
      expect(url).toBe(`${BASE}/api/v1/static/44.51,40.18,12/128x128.png`);
      const headers = init.headers as Record<string, string>;
      expect(headers.Authorization).toBe(`Bearer ${KEY}`);
      expect(headers.Accept).toBe("image/png");
    });

    it("401 rejects with SphyraError INVALID_API_KEY", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        headers: { get: (name: string) => (name.toLowerCase() === "content-type" ? "application/json" : null) },
        json: () => Promise.resolve({ error: { code: "INVALID_API_KEY", message: "Invalid API key" } }),
      });
      const client = new SphyraClient({ baseUrl: BASE, apiKey: KEY });

      const err = await client
        .fetchStaticImage({
          position: { kind: "center", lon: 44.51, lat: 40.18, zoom: 12 },
          width: 128,
          height: 128,
        })
        .catch((e) => e);

      expect(err).toBeInstanceOf(SphyraError);
      expect((err as SphyraError).code).toBe("INVALID_API_KEY");
    });
  });
});
