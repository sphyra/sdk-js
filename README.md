<p align="center">
  <a href="https://sphyra.kidup.am">
    <img src="assets/logo-wordmark.svg" alt="Sphyra" width="300" />
  </a>
</p>

<p align="center">
  <strong>@sphyra/js</strong><br />
  Framework-agnostic JavaScript/TypeScript SDK for the Sphyra map &amp; geocoding API
</p>

<p align="center">
  Browser (ESM / UMD) · Node ≥18 · MapLibre GL · TypeScript strict
</p>

<p align="center">
  <a href="#install">Install</a> ·
  <a href="#quickstart">Quickstart</a> ·
  <a href="#map-rendering">Map</a> ·
  <a href="#geocoding">Geocoding</a> ·
  <a href="#runnable-demo">Demo</a>
</p>

---

## Overview

Sphyra is a self-hosted OpenStreetMap stack for **Armenia** — vector tiles, geocoding, routing, search, and more. `@sphyra/js` is the official client for browser and Node apps: one typed surface for the REST API, plus helpers to render a signed MapLibre map without leaking your API key into style JSON.

**What you get out of the box**

- `SphyraClient` — geocoding, tiles, routing, search, static images, and every Phase-10 service
- `createSphyraMap()` — signed style + runtime day/dusk/night presets and 2D/3D switching
- Map helpers — markers, popups, clustering, navigation/geolocate/scale controls
- Full TypeScript types in `dist/index.d.ts`

> **Runnable reference:** [`examples/web-demo/`](examples/web-demo/) — local Vite demo with the full Standard style and every API wired up.

## Prerequisites

Start the local Sphyra stack before your first integration test:

```bash
cd sphyra/api
docker compose up -d
curl http://localhost:4000/health   # → {"status":"ok"}
```

The dev key `sphyra_dev_local` is seeded automatically (`DevApiKeySeeder`). Never commit a production key.

### Environments

| Environment | `baseUrl` | `apiKey` |
|-------------|-----------|----------|
| **Local** (first run) | `http://localhost:4000` | `sphyra_dev_local` |
| **Production** | `https://sphyra.kidup.am` | `SPHYRA_API_KEY` (from your secret store) |

Only `baseUrl` and `apiKey` change between local and production.

## Install

```bash
pnpm add @sphyra/js maplibre-gl
```

`@sphyra/js` is **not yet on npm**. Until publish, install from a path or git ref:

```bash
pnpm add file:../sdk-js maplibre-gl
# or: pnpm add git+https://github.com/sphyra/sdk-js.git#main maplibre-gl
```

| Package | Role |
|---------|------|
| `maplibre-gl ^4.7.1` | **Required** peer — map rendering |
| `@mapbox/mapbox-gl-draw ^1.4.3` | **Optional** peer — only for `createDrawControl()` |

## Quickstart

```ts
import { SphyraClient } from "@sphyra/js";

const client = new SphyraClient({
  baseUrl: "http://localhost:4000",
  apiKey: "sphyra_dev_local",
});

const { status } = await client.healthCheck();
console.log(status); // "ok"
```

<details>
<summary><strong>Browser — ESM</strong></summary>

```html
<link href="https://unpkg.com/maplibre-gl@4/dist/maplibre-gl.css" rel="stylesheet" />
<div id="map" style="width:100%;height:400px"></div>
<script type="module">
  import { SphyraClient } from "./node_modules/@sphyra/js/dist/index.js";

  const client = new SphyraClient({
    baseUrl: "http://localhost:4000",
    apiKey: "sphyra_dev_local",
  });
</script>
```

</details>

<details>
<summary><strong>Browser — UMD</strong></summary>

```html
<link href="https://unpkg.com/maplibre-gl@4/dist/maplibre-gl.css" rel="stylesheet" />
<script src="./node_modules/@sphyra/js/dist/index.umd.js"></script>
<script>
  const client = new Sphyra.SphyraClient({
    baseUrl: "http://localhost:4000",
    apiKey: "sphyra_dev_local",
  });
</script>
```

Exports are available on the global `Sphyra` object.

</details>

<details>
<summary><strong>Node</strong></summary>

```ts
import { SphyraClient } from "@sphyra/js";

const client = new SphyraClient({
  baseUrl: "http://localhost:4000",
  apiKey: "sphyra_dev_local",
});

const results = await client.forwardGeocode({ q: "Երևան", lang: "hy", limit: 3 });
console.log(results[0]?.displayName);
```

</details>

## Map rendering

`createSphyraMap()` fetches the signed MapLibre style once, signs tile and asset requests in-process, and keeps your API key out of the style object.

```ts
import "maplibre-gl/dist/maplibre-gl.css";
import {
  SphyraClient,
  createSphyraMap,
  addMarker,
  addPopup,
  addNavigationControl,
  addGeolocateControl,
  addScaleControl,
} from "@sphyra/js";

const client = new SphyraClient({
  baseUrl: "http://localhost:4000",
  apiKey: "sphyra_dev_local",
});

const handle = await createSphyraMap("map", {
  client,
  preset: "day",              // "day" | "dusk" | "night"
  mode: "3d",                 // "2d" | "3d"
  center: [44.5152, 40.1872], // [lon, lat] — Yerevan
  zoom: 13,
  onLoad: (map) => {
    addNavigationControl(map);
    addGeolocateControl(map);
    addScaleControl(map);

    const popup = addPopup(map, {
      lngLat: [44.5152, 40.1872],
      html: "<strong>Republic Square</strong>",
      open: false,
    });

    addMarker(map, {
      lngLat: [44.5152, 40.1872],
      color: "#e63946",
      onClick: () => popup.open(),
    });
  },
});

handle.setPreset("night"); // runtime — no re-fetch
handle.setMode("2d");
handle.destroy();
```

Lower-level: `client.getTileConfig()` and `client.getMapStyle({ preset, mode })` if you wire MapLibre yourself. Most apps should use `createSphyraMap()`.

## Geocoding

```ts
import { SphyraClient } from "@sphyra/js";

const client = new SphyraClient({
  baseUrl: "http://localhost:4000",
  apiKey: "sphyra_dev_local",
});

// Reverse — coordinates → address (default lang: "hy")
const place = await client.reverseGeocode({
  lat: 40.1872,
  lon: 44.5152,
  lang: "hy",
});
// place.displayName → "Հանրապետության հրապարակ, Երևան, Հայաստան"

// Forward — text → ranked hits
const hits = await client.forwardGeocode({
  q: "Աբովյան",
  lang: "hy",
  limit: 5,
});
```

Supported languages: `"hy"` · `"en"` · `"ru"`.

## Error handling

API failures throw `SphyraError` with `code`, `message`, and optional `statusCode`:

```ts
import { SphyraError } from "@sphyra/js";

try {
  await client.reverseGeocode({ lat: 40.18, lon: 44.51 });
} catch (err) {
  if (err instanceof SphyraError) {
    console.error(err.code, err.statusCode, err.message);
    // e.g. INVALID_API_KEY · 401
  }
}
```

| Behaviour | Detail |
|-----------|--------|
| **Retries** | 5xx, `TIMEOUT`, `NETWORK` — up to 3× with 1s / 2s / 4s backoff |
| **No retry** | 4xx client errors fail immediately |
| **Timeout** | Default 10 000 ms — override via `timeout` on `SphyraClient` |

## Runnable demo

[`examples/web-demo/`](examples/web-demo/) is the canonical integration sample: Standard style (labels, sprites, 3D buildings, terrain), presets, markers, clustering, routing, search, and every Phase-10 service tab.

```bash
# From this repo — local stack must be running
pnpm install && pnpm build
cd examples/web-demo
pnpm install && pnpm dev    # → http://localhost:5173
```

The demo proxies `/api`, `/tiles`, and `/health` to `http://localhost:4000` through Vite so signed URLs work without CORS.

## TypeScript

All public types ship in `dist/index.d.ts`:

| Type | Purpose |
|------|---------|
| `SphyraClientOptions` | Client constructor |
| `ReverseGeocodeResult` / `GeocodeResult` | Geocoding responses |
| `GeocodeLang` | `"hy"` \| `"en"` \| `"ru"` |
| `TileConfigResponse` | Signed tile URLs + expiry |
| `CreateSphyraMapOptions` / `SphyraMapHandle` | Map helper |
| `StylePreset` / `StyleMode` | Light preset and 2D/3D mode |

```bash
pnpm typecheck
```

---

<p align="center">
  <sub>Armenia-only coverage · <a href="https://sphyra.kidup.am">sphyra.kidup.am</a> · Built for <a href="https://kidup.am">KidUp</a></sub>
</p>

## Commit hygiene

This repository must show only its human authors in the contributor list. A local hook
rejects AI co-author trailers before a commit is created — enable it once per clone:

```bash
git config core.hooksPath .githooks
```

The same check runs in CI (`no-ai-trailers`) over every commit in a merge/pull request
range, so a bypassed local hook still fails the pipeline.
