import { test } from "node:test";
import assert from "node:assert/strict";
import { SphyraClient } from "@sphyra/js";
import {
  MATRIX_SOURCES,
  MATRIX_TARGETS,
  ISOCHRONE_ORIGIN,
  MAP_MATCH_TRACE,
  OPTIMIZE_STOPS,
} from "./service-samples.js";

const BASE = process.env.SPHYRA_BASE_URL ?? "http://localhost:4000";
const KEY = process.env.SPHYRA_API_KEY ?? "sphyra_dev_local";

// CI-safe gate: only run when explicitly opted in AND the stack answers /health.
// Otherwise both cases skip (never fail) — same discipline as the API repo's
// environment-gated integration tests.
async function stackReachable() {
  if (!process.env.SPHYRA_LOCAL_STACK) return false;
  try {
    const res = await fetch(`${BASE}/health`);
    return res.ok;
  } catch {
    return false;
  }
}
const up = await stackReachable();
const skip = up ? false : "local stack not reachable (set SPHYRA_LOCAL_STACK=1 with the stack up)";

test("map-style.json returns signed vector tile sources", { skip }, async () => {
  const res = await fetch(`${BASE}/api/v1/map-style.json`, {
    headers: { Authorization: `Bearer ${KEY}` },
  });
  assert.equal(res.status, 200);
  const style = await res.json();
  const keys = Object.keys(style.sources ?? {});
  assert.ok(keys.length > 0, "style has at least one source");
  const firstTiles = style.sources[keys[0]].tiles;
  assert.ok(Array.isArray(firstTiles) && firstTiles.length > 0, "source has tile URLs");
  assert.match(String(firstTiles[0]), /sig=/, "tile URL is HMAC-signed");
});

test("reverseGeocode resolves a non-empty displayName via @sphyra/js", { skip }, async () => {
  const client = new SphyraClient({ baseUrl: BASE, apiKey: KEY });
  const result = await client.reverseGeocode({ lat: 40.1872, lon: 44.5152, lang: "hy" });
  assert.equal(typeof result.displayName, "string");
  assert.ok(result.displayName.length > 0, "displayName is non-empty");
});

test("map-style.json ships rendering completeness (glyphs + sprite + terrain), all signed", { skip }, async () => {
  const res = await fetch(`${BASE}/api/v1/map-style.json`, { headers: { Authorization: `Bearer ${KEY}` } });
  assert.equal(res.status, 200);
  const style = await res.json();
  assert.equal(typeof style.glyphs, "string");
  assert.match(style.glyphs, /sig=/, "glyphs URL is signed");
  assert.equal(typeof style.sprite, "string");
  assert.match(style.sprite, /sig=/, "sprite URL is signed");
  const terrain = style.sources?.sphyra_terrain;
  assert.equal(terrain?.type, "raster-dem", "terrain raster-dem source present");
  assert.match(String(terrain.tiles?.[0]), /sig=/, "terrain tile URL is signed");
});

test("directions returns a route geometry", { skip }, async () => {
  const client = new SphyraClient({ baseUrl: BASE, apiKey: KEY });
  const result = await client.directions({
    waypoints: [
      [44.5152, 40.1893],
      [44.5136, 40.1772],
    ],
    geometries: "geojson",
  });
  assert.equal(result.routes[0].geometry.type, "LineString");
});

test("matrix returns durations grid", { skip }, async () => {
  const client = new SphyraClient({ baseUrl: BASE, apiKey: KEY });
  const result = await client.matrix({
    sources: MATRIX_SOURCES.slice(0, 2),
    targets: MATRIX_TARGETS.slice(0, 2),
  });
  assert.equal(result.durations.length, 2);
});

test("isochrone returns features", { skip }, async () => {
  const client = new SphyraClient({ baseUrl: BASE, apiKey: KEY });
  const result = await client.isochrone({ origin: ISOCHRONE_ORIGIN, contoursMinutes: [5, 10] });
  assert.ok(result.features.length >= 1);
});

test("mapMatch returns matched geometry", { skip }, async () => {
  const client = new SphyraClient({ baseUrl: BASE, apiKey: KEY });
  const result = await client.mapMatch({ coordinates: MAP_MATCH_TRACE, geometries: "geojson" });
  assert.equal(typeof result.distance, "number");
});

test("optimize returns reordered trip", { skip }, async () => {
  const client = new SphyraClient({ baseUrl: BASE, apiKey: KEY });
  const result = await client.optimize({ waypoints: OPTIMIZE_STOPS, geometries: "geojson" });
  assert.ok(result.trips[0].geometry);
});

test("tilequery returns features", { skip }, async () => {
  const client = new SphyraClient({ baseUrl: BASE, apiKey: KEY, timeout: 30_000 });
  const result = await client.tilequery({ lon: 44.5136, lat: 40.1772, limit: 5 });
  assert.ok(Array.isArray(result.features));
});

test("fetchStaticImage returns a PNG blob", { skip }, async () => {
  const client = new SphyraClient({ baseUrl: BASE, apiKey: KEY });
  const blob = await client.fetchStaticImage({
    position: { kind: "center", lon: 44.51, lat: 40.18, zoom: 12 },
    width: 128,
    height: 128,
  });
  assert.equal(blob.type, "image/png");
  assert.ok(blob.size > 0);
});

test("searchSuggest returns suggestions", { skip }, async () => {
  const client = new SphyraClient({ baseUrl: BASE, apiKey: KEY });
  const result = await client.searchSuggest({ q: "Yerevan", limit: 3 });
  assert.ok(result.suggestions.length >= 1);
});
