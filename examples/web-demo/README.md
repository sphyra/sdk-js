# @sphyra/js — local web demo

Local-only browser demo: renders the **full Sphyra Standard style** (text labels,
sprites, 3D buildings, terrain) via `createSphyraMap()`, with day/dusk/night light
presets, a 2D/3D toggle, markers + popups, a clustered Armenia POI layer, and the
built-in nav/geolocate/scale controls — plus click-to-reverse-geocode + address
search against the local Sphyra stack. **Not deployed, not published.**

## Prerequisites

1. Local Sphyra stack up (see `sphyra/api`): `docker compose up -d`. Confirm
   `curl http://localhost:4000/health` → `{"status":"ok"}`. Dev API key
   `sphyra_dev_local` is seeded automatically.
2. Build the SDK once from the repo root: `cd ../.. && pnpm build`.

The demo is served by Vite on `:5173` and proxies `/api`, `/tiles`, `/health` to
the API. The API has no CORS, so the map-style's **absolute** signed URLs (emitted
from the API's `SPHYRA_PUBLIC_URL`, often the dev LAN IP) would otherwise be fetched
cross-origin and blocked. The demo passes a `transformRequest` to `createSphyraMap()`
that rewrites any `/api`, `/tiles`, `/health` request to this page's origin so it
flows through the Vite proxy — so **the demo works regardless of the API's
`SPHYRA_PUBLIC_URL`** (no need to set it to `:5173`). The HMAC signs path+query, so
changing only the host keeps signatures valid.

## Run

```bash
pnpm install
cp config.example.js config.js   # optional; defaults already work
pnpm dev                         # http://localhost:5173
```

Open <http://localhost:5173/>. Requests are proxied to `http://localhost:4000`
(the API has no CORS, so the demo must not be opened from a plain static server).

## Try it

- The map opens over Yerevan at z13 in the full Standard style — **text labels**,
  **sprites/icons**, **3D buildings**, and **terrain** all render via
  `createSphyraMap()`.
- **Preset** selector (`day` / `dusk` / `night`) re-lights the style at runtime
  (no re-fetch). The **3D/2D** button tilts/flattens the map.
- **Markers + popups** mark a few landmarks (Cascade, Republic Square,
  Matenadaran); a **clustered POI layer** groups ~12 Armenia points and expands on
  click, with a popup on each unclustered point.
- **Nav / geolocate / scale** controls are present (top-right + bottom-left).
- **Left sidebar** — icon rail (Search, Directions, Layers, Inspect, and API tools) with a slide-out panel, similar to Google Maps-style map UIs.
- **Logo** — Sphyra mark from `public/sphyra.svg` (no background tile).
- **Light presets** — vertical Day / Dusk / Night icons under the logo.
- **Tools** — all icons in the left rail (Search, Directions, Layers, Inspect, plus API demos).
- **3D/2D** toggle and stack health dot sit in the sidebar footer.
- Click anywhere (Inspect tool) → the panel shows **reverse geocode** in the selected language
  plus any **tile feature** beneath the cursor.
- **Search** tool → address search with suggest/retrieve; fly-to on select.
- **Service tools** in the sidebar exercise every Phase-10 API via `@sphyra/js` typed
  methods (no raw `fetch`):
  - **Directions** — click map for A/B, or run sample route.
  - **Matrix** — duration grid between Yerevan landmarks.
  - **Isochrone** — reachability polygons drawn on the map.
  - **Match** — GPS trace map-matched to roads.
  - **Optimize** — reordered delivery stops + trip line.
  - **Tilequery** — click the map to list features at the point.
  - **Static** — `fetchStaticImage()` preview of the current view.

## Config

`config.js` (git-ignored) or `?baseUrl=&apiKey=` query params override the
built-in defaults (`baseUrl: ""` → proxy, `apiKey: "sphyra_dev_local"`).
Never commit a real key.

## Smoke test

`SPHYRA_LOCAL_STACK=1 node --test` (requires the stack up; skips otherwise).
Asserts the style ships signed vector tiles, a working reverse-geocode round-trip,
rendering completeness (signed glyphs + sprite + terrain raster-dem source), and one
call each for directions, matrix, isochrone, map-match, optimize, tilequery,
`fetchStaticImage`, and `searchSuggest` (11 tests total when the stack is up).

## Headless test

Playwright loads the running demo, cycles the presets + 2D/3D toggle via the real
UI, walks every **service tab** (directions/matrix/isochrone/match/optimize/tilequery/static)
and clicks each panel's primary action (map click for tilequery; waits for the static
preview image), then asserts **zero console errors**, writing a screenshot to
`screenshots/demo.png` (git-ignored). With the API up
(`SPHYRA_PUBLIC_URL=http://localhost:5173`) and `pnpm dev` running:

```bash
npx playwright install chromium          # once
SPHYRA_LOCAL_STACK=1 pnpm test:headless
```

Skips (never fails) when the stack/demo server or Chromium is absent.
