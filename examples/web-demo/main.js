import "maplibre-gl/dist/maplibre-gl.css";
import {
  SphyraClient,
  SphyraError,
  createSphyraMap,
  addMarker,
  addPopup,
  addClusterSource,
  addNavigationControl,
  addGeolocateControl,
  addScaleControl,
  SphyraDirectionsControl,
  SphyraGeocoderControl,
} from "@sphyra/js";
import { SAMPLE_POINTS, MARKERS } from "./sample-points.js";
import {
  MATRIX_SOURCES,
  MATRIX_TARGETS,
  ISOCHRONE_ORIGIN,
  MAP_MATCH_TRACE,
  OPTIMIZE_STOPS,
  DIRECTIONS_WAYPOINTS,
} from "./service-samples.js";

// --- Config: built-in defaults < window.SPHYRA_CONFIG (config.js) < ?baseUrl=&apiKey= query params.
const DEFAULTS = { baseUrl: "", apiKey: "sphyra_dev_local" };
const fromWindow = typeof window !== "undefined" ? window.SPHYRA_CONFIG ?? {} : {};
const qs = new URLSearchParams(window.location.search);
const config = {
  baseUrl: qs.get("baseUrl") ?? fromWindow.baseUrl ?? DEFAULTS.baseUrl,
  apiKey: qs.get("apiKey") ?? fromWindow.apiKey ?? DEFAULTS.apiKey,
};

const YEREVAN = [44.5152, 40.1872]; // [lng, lat] — MapLibre order
const DEFAULT_ZOOM = 17;
const USER_LOCATION_ZOOM = 18;
const panelBody = document.getElementById("panel-body");
const resultsEl = document.getElementById("results");
const errorBox = document.getElementById("error");
const healthEl = document.getElementById("health");
const langSelect = document.getElementById("lang-select");
const presetPicker = document.querySelector(".preset-picker");
const modeBtn = document.getElementById("mode-toggle");
const modeLabel = document.getElementById("mode-label");
const sidebarRail = document.querySelector(".sidebar-rail");
const toolPanel = document.getElementById("tool-panel");
const toolPanelTitle = document.getElementById("tool-panel-title");
const toolPanelClose = document.getElementById("tool-panel-close");

const TOOL_TITLES = {
  search: "Search",
  directions: "Directions",
  layers: "Layers",
  inspect: "Inspect",
  isochrone: "Isochrone",
  matrix: "Matrix",
  match: "Map match",
  optimize: "Optimize",
  tilequery: "Tile query",
  static: "Static image",
};

const client = new SphyraClient({ baseUrl: config.baseUrl, apiKey: config.apiKey });

const TILE_LAYERS = ["pois-circle", "buildings-fill", "roads-line", "water-fill", "landuse-fill"];

/** Style layer groups exposed in the Layers panel. */
const LAYER_GROUPS = [
  { id: "roads", label: "Roads & arrows", layers: ["roads-casing", "roads-rim", "roads-line", "roads-lanes", "roads-oneway", "roads-crosswalk-base", "roads-crosswalk", "roads-label"] },
  { id: "pois", label: "POIs", layers: ["pois-circle", "pois-icon", "pois-label"] },
  { id: "buildings", label: "Buildings", layers: ["buildings-fill", "buildings-3d", "buildings-housenumber-label", "housenumbers-label"] },
  { id: "trees", label: "Trees", layers: ["trees-canopy-back", "trees-canopy-mid", "trees-canopy-front"] },
  { id: "landuse", label: "Parks & landuse", layers: ["landuse-fill", "landuse-label"] },
  { id: "water", label: "Water", layers: ["water-fill", "water-label"] },
  { id: "places", label: "Place names", layers: ["places-label"] },
  { id: "labels", label: "Address labels", layers: ["housenumbers-label"] },
];

const langOf = () => /** @type {"hy"|"en"|"ru"} */ (langSelect.value || "hy");
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

let activeService = "inspect";
let activePreset = "day";
let mode = "3d";
let directionsCtrl = null;
/** @type {string | null} */
let staticPreviewUrl = null;

function showError(err) {
  const msg =
    err instanceof SphyraError
      ? `Sphyra error [${err.code}]${err.statusCode ? " " + err.statusCode : ""}: ${err.message}`
      : `Error: ${err && err.message ? err.message : String(err)}`;
  errorBox.textContent = msg;
  errorBox.hidden = false;
}

async function refreshHealth() {
  try {
    const { status } = await client.healthCheck();
    healthEl.textContent = "●";
    healthEl.title = `Stack: ${status}`;
    healthEl.className = `health-dot ${status === "ok" ? "ok" : "degraded"}`;
  } catch {
    healthEl.textContent = "●";
    healthEl.title = "Stack: unreachable";
    healthEl.className = "health-dot down";
  }
}

function addressHtml(r) {
  const rows = [
    ["address", r.displayName],
    ["street", r.street],
    ["district", r.district],
    ["city", r.city],
    ["country", r.country],
    ["lat,lon", `${r.lat.toFixed(5)}, ${r.lon.toFixed(5)}`],
  ].filter(([, v]) => v != null && v !== "");
  return `<h3>Reverse geocode (${esc(langOf())})</h3><dl>${rows
    .map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`)
    .join("")}</dl>`;
}

function featuresHtml(features) {
  const seen = new Set();
  const pills = [];
  for (const f of features) {
    const p = f.properties || {};
    const label = p.name || p.building || p.highway || p.amenity || p.shop || p.tourism || p.landuse || p.water_class;
    if (!label) continue;
    const kind = [p.building && "building", p.highway && `road:${p.highway}`, p.amenity && `amenity:${p.amenity}`,
      p.shop && `shop:${p.shop}`, p.tourism && `tourism:${p.tourism}`, p.landuse && `landuse:${p.landuse}`,
      p.water_class && `water:${p.water_class}`].filter(Boolean)[0] || f.sourceLayer;
    const key = `${f.sourceLayer}:${label}:${kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pills.push(`<span class="feature-pill" title="${esc(f.sourceLayer)}">${esc(label)} · ${esc(kind)}</span>`);
  }
  if (!pills.length) return `<h3>Map feature here</h3><div>(no named tile feature under cursor)</div>`;
  return `<h3>Map feature here (from tiles)</h3><div>${pills.join("")}</div>`;
}

function tilequeryHtml(features) {
  if (!features.length) return "<div>No features within query radius.</div>";
  const rows = features.map((f) => {
    const name = f.properties?.name ?? f.properties?.building ?? f.properties?.highway ?? "(unnamed)";
    const layer = f.properties?.tilequery?.layer ?? "?";
    const dist = f.properties?.tilequery?.distance;
    const distTxt = typeof dist === "number" ? `${dist.toFixed(1)} m` : "—";
    return `<li><strong>${esc(name)}</strong> · ${esc(layer)} · ${esc(distTxt)}</li>`;
  });
  return `<h3>Tilequery features</h3><ul class="results">${rows.join("")}</ul>`;
}

function setActiveTool(tool, { openPanel = true } = {}) {
  activeService = tool;
  for (const btn of sidebarRail.querySelectorAll("button[data-tool]")) {
    btn.classList.toggle("active", openPanel && btn.dataset.tool === tool);
  }
  for (const section of document.querySelectorAll(".panel-section")) {
    const id = section.id.replace("panel-", "");
    const show = id === tool;
    section.hidden = !show;
    section.classList.toggle("active", show);
  }
  if (toolPanelTitle) toolPanelTitle.textContent = TOOL_TITLES[tool] ?? tool;
  if (openPanel) {
    toolPanel?.classList.add("open");
    toolPanel?.setAttribute("aria-hidden", "false");
  }
  directionsCtrl?.setInteractive(tool === "directions");
}

function closeToolPanel() {
  toolPanel?.classList.remove("open");
  toolPanel?.setAttribute("aria-hidden", "true");
  for (const btn of sidebarRail.querySelectorAll("button[data-tool]")) {
    btn.classList.remove("active");
  }
}

function toggleToolPanel(tool) {
  const isSame = activeService === tool && toolPanel?.classList.contains("open");
  if (isSame) {
    closeToolPanel();
    return;
  }
  setActiveTool(tool);
}

function flyToUserLocation(map, geolocateCtrl) {
  if (!navigator.geolocation) return;
  const onLocated = (e) => {
    map.flyTo({
      center: [e.coords.longitude, e.coords.latitude],
      zoom: USER_LOCATION_ZOOM,
      essential: true,
    });
    map.off("geolocate", onLocated);
  };
  map.on("geolocate", onLocated);
  geolocateCtrl.trigger();
}

function removeDemoLayer(map, sourceId, layerIds = []) {
  for (const id of layerIds) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  if (map.getSource(sourceId)) map.removeSource(sourceId);
}

function drawGeoJsonLine(map, sourceId, geometry, color = "#dc2626") {
  const layerId = `${sourceId}-line`;
  removeDemoLayer(map, sourceId, [layerId]);
  map.addSource(sourceId, {
    type: "geojson",
    data: { type: "Feature", properties: {}, geometry },
  });
  map.addLayer({
    id: layerId,
    type: "line",
    source: sourceId,
    layout: { "line-join": "round", "line-cap": "round" },
    paint: { "line-color": color, "line-width": 4 },
  });
}

function drawGeoJsonFill(map, sourceId, features) {
  removeDemoLayer(map, sourceId, [`${sourceId}-fill`]);
  map.addSource(sourceId, {
    type: "geojson",
    data: { type: "FeatureCollection", features },
  });
  map.addLayer({
    id: `${sourceId}-fill`,
    type: "fill",
    source: sourceId,
    paint: {
      "fill-color": ["coalesce", ["get", "color"], "#3b82f6"],
      "fill-opacity": 0.35,
      "fill-outline-color": ["coalesce", ["get", "color"], "#1d4ed8"],
    },
  });
}

function addDemoLayers(map) {
  addClusterSource(map, "sample-poi", {
    data: SAMPLE_POINTS,
    clusterMaxZoom: 13,
    onPointClick: (f, lngLat) =>
      addPopup(map, {
        lngLat,
        html: `<strong>${esc(f.properties.name)}</strong><br>${esc(f.properties.category)}`,
      }),
  });

  const syncDemoOverlay = () => {
    const show = map.getZoom() < 15;
    for (const id of ["sample-poi-unclustered", "sample-poi-clusters", "sample-poi-cluster-count"]) {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", show ? "visible" : "none");
    }
    for (const handle of demoMarkers) handle.marker.getElement().style.display = show ? "" : "none";
  };
  map.on("zoom", syncDemoOverlay);
  syncDemoOverlay();

  for (const m of MARKERS) {
    const handle = addMarker(map, { lngLat: m.lngLat, color: "#2563eb" });
    addPopup(map, { marker: handle.marker, html: m.html });
    demoMarkers.push(handle);
  }
}

/** @type {import("@sphyra/js").SphyraMarkerHandle[]} */
const demoMarkers = [];

function wirePresetPicker(handle) {
  presetPicker?.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-preset]");
    if (!btn) return;
    const preset = /** @type {import("@sphyra/js").StylePreset} */ (btn.dataset.preset);
    activePreset = preset;
    for (const el of presetPicker.querySelectorAll("[data-preset]")) {
      const on = el.dataset.preset === preset;
      el.classList.toggle("active", on);
      el.setAttribute("aria-checked", String(on));
    }
    handle.setPreset(preset);
  });
}

function wireSidebarNav() {
  sidebarRail?.addEventListener("click", (ev) => {
    const btn = ev.target.closest("button[data-tool]");
    if (!btn) return;
    toggleToolPanel(btn.dataset.tool);
  });
  toolPanelClose?.addEventListener("click", closeToolPanel);
}

function wireLayerToggles(map) {
  const host = document.getElementById("layer-toggles");
  if (!host) return;
  host.replaceChildren();
  for (const group of LAYER_GROUPS) {
    const present = group.layers.filter((id) => map.getLayer(id));
    if (!present.length) continue;
    const label = document.createElement("label");
    label.className = "layer-toggle";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = true;
    cb.dataset.layers = present.join(",");
    cb.addEventListener("change", () => {
      const vis = cb.checked ? "visible" : "none";
      for (const id of present) {
        if (mode === "3d" && id === "buildings-fill") continue;
        if (mode === "2d" && id === "buildings-3d") continue;
        map.setLayoutProperty(id, "visibility", vis);
      }
    });
    label.append(cb, document.createTextNode(` ${group.label}`));
    host.appendChild(label);
  }
}

function wireServiceActions(map) {
  document.getElementById("run-directions").addEventListener("click", async () => {
    const out = document.getElementById("directions-result");
    out.textContent = "Loading…";
    errorBox.hidden = true;
    try {
      if (!directionsCtrl) throw new Error("Directions control not ready");
      await directionsCtrl.setWaypoints(DIRECTIONS_WAYPOINTS);
    } catch (err) {
      out.textContent = "";
      showError(err);
    }
  });

  document.getElementById("run-matrix").addEventListener("click", async () => {
    const grid = document.getElementById("matrix-grid");
    grid.textContent = "Loading…";
    errorBox.hidden = true;
    try {
      const r = await client.matrix({ sources: MATRIX_SOURCES, targets: MATRIX_TARGETS });
      const header = `<tr><th></th>${MATRIX_TARGETS.map((_, i) => `<th>T${i + 1}</th>`).join("")}</tr>`;
      const body = r.durations
        .map((row, si) => {
          const cells = row.map((d) => `<td>${d == null ? "—" : d.toFixed(0)}s</td>`).join("");
          return `<tr><th>S${si + 1}</th>${cells}</tr>`;
        })
        .join("");
      grid.innerHTML = `<table>${header}${body}</table>`;
    } catch (err) {
      showError(err);
    }
  });

  document.getElementById("run-isochrone").addEventListener("click", async () => {
    const out = document.getElementById("isochrone-result");
    out.textContent = "Loading…";
    errorBox.hidden = true;
    try {
      const r = await client.isochrone({
        origin: ISOCHRONE_ORIGIN,
        contoursMinutes: [5, 10, 15],
        polygons: true,
      });
      drawGeoJsonFill(map, "sphyra-demo-isochrone", r.features);
      out.textContent = `${r.features.length} contour polygon(s) drawn on the map.`;
    } catch (err) {
      showError(err);
    }
  });

  document.getElementById("run-match").addEventListener("click", async () => {
    const out = document.getElementById("match-result");
    out.textContent = "Loading…";
    errorBox.hidden = true;
    try {
      const r = await client.mapMatch({ coordinates: MAP_MATCH_TRACE, geometries: "geojson" });
      if (r.geometry?.type === "LineString") {
        drawGeoJsonLine(map, "sphyra-demo-match", r.geometry, "#7c3aed");
      }
      out.innerHTML = `Confidence: <strong>${(r.confidence * 100).toFixed(0)}%</strong> · Distance: ${r.distance.toFixed(0)} m · Duration: ${r.duration.toFixed(0)} s`;
    } catch (err) {
      showError(err);
    }
  });

  document.getElementById("run-optimize").addEventListener("click", async () => {
    const out = document.getElementById("optimize-result");
    out.textContent = "Loading…";
    errorBox.hidden = true;
    try {
      const shuffled = [...OPTIMIZE_STOPS].sort(() => Math.random() - 0.5);
      const r = await client.optimize({ waypoints: shuffled, geometries: "geojson" });
      const order = r.waypoints.map((w) => w.waypointIndex).join(" → ");
      if (r.trips[0]?.geometry?.type === "LineString") {
        drawGeoJsonLine(map, "sphyra-demo-optimize", r.trips[0].geometry, "#059669");
      }
      out.innerHTML = `Input shuffled; optimized visit order (indices): <strong>${order}</strong>`;
    } catch (err) {
      showError(err);
    }
  });

  document.getElementById("run-static-image").addEventListener("click", async () => {
    const img = document.getElementById("static-preview");
    img.hidden = true;
    try {
      const c = map.getCenter();
      const blob = await client.fetchStaticImage({
        position: {
          kind: "center",
          lon: c.lng,
          lat: c.lat,
          zoom: map.getZoom(),
          bearing: map.getBearing(),
          pitch: map.getPitch(),
        },
        width: 400,
        height: 300,
        preset: /** @type {import("@sphyra/js").StylePreset} */ (activePreset),
        mode: mode === "3d" ? "3d" : "2d",
      });
      if (staticPreviewUrl) URL.revokeObjectURL(staticPreviewUrl);
      staticPreviewUrl = URL.createObjectURL(blob);
      img.src = staticPreviewUrl;
      img.hidden = false;
    } catch (err) {
      showError(err);
    }
  });
}

async function init() {
  refreshHealth();
  wireSidebarNav();
  setActiveTool("inspect", { openPanel: false });

  const directionsOpts = {
    client,
    language: langOf(),
    interactive: false,
    onError: showError,
    onRoute: (result) => {
      const el = document.getElementById("directions-result");
      const route = result.routes[0];
      if (!route) {
        el.textContent = "No route returned.";
        return;
      }
      el.textContent = `Route: ${route.distance.toFixed(0)} m · ${route.duration.toFixed(0)} s · ${route.legs[0]?.steps.length ?? 0} steps`;
    },
  };
  const geocoderOpts = {
    client,
    lang: langOf(),
    onError: showError,
    placeholder: "Search places in Armenia…",
  };

  let handle;
  try {
    handle = await createSphyraMap("map", {
      client,
      preset: activePreset,
      mode: "3d",
      center: YEREVAN,
      zoom: DEFAULT_ZOOM,
      logoUrl: "/sphyra.svg",
      logoSize: 22,
      transformRequest: (url) => {
        try {
          const u = new URL(url, window.location.origin);
          if (u.pathname.startsWith("/tiles") || u.pathname.startsWith("/api") || u.pathname.startsWith("/health")) {
            return { url: window.location.origin + u.pathname + u.search };
          }
        } catch {
          /* non-URL inputs pass through unchanged */
        }
        return undefined;
      },
      onError: showError,
      onLoad: (map) => {
        addDemoLayers(map);

        directionsCtrl = new SphyraDirectionsControl(directionsOpts);
        const directionsHost = document.getElementById("directions-ctrl-host");
        const directionsEl = directionsCtrl.onAdd(map);
        directionsHost?.appendChild(directionsEl);

        const geocoderCtrl = new SphyraGeocoderControl(geocoderOpts);
        const geocoderHost = document.getElementById("geocoder-host");
        const geocoderEl = geocoderCtrl.onAdd(map);
        geocoderHost?.appendChild(geocoderEl);

        wireLayerToggles(map);
        wireServiceActions(map);
        window.__SPHYRA_DEMO_MAP = map;
        window.__SPHYRA_DEMO_READY = true;
        window.__SPHYRA_COUNT_TREES_NEAR = (lng, lat, radiusDeg) => {
          const feats = map.querySourceFeatures("sphyra_trees", { sourceLayer: "trees" });
          let n = 0;
          for (const f of feats) {
            if (f.geometry?.type !== "Point") continue;
            const [flng, flat] = f.geometry.coordinates;
            if (Math.abs(flng - lng) < radiusDeg && Math.abs(flat - lat) < radiusDeg) n++;
          }
          return n;
        };
      },
    });
  } catch (err) {
    showError(err);
    return;
  }
  const map = handle.map;

  addNavigationControl(map);
  const geolocateCtrl = addGeolocateControl(map);
  addScaleControl(map);
  flyToUserLocation(map, geolocateCtrl);

  wirePresetPicker(handle);

  modeBtn.addEventListener("click", () => {
    mode = mode === "3d" ? "2d" : "3d";
    handle.setMode(mode);
    if (modeLabel) modeLabel.textContent = mode.toUpperCase();
    modeBtn.setAttribute("aria-pressed", String(mode === "3d"));
  });

  langSelect.addEventListener("change", () => {
    directionsOpts.language = langOf();
    geocoderOpts.lang = langOf();
  });

  map.on("mousemove", (e) => {
    if (activeService === "directions") return;
    const present = TILE_LAYERS.filter((l) => map.getLayer(l));
    const hits = present.length ? map.queryRenderedFeatures(e.point, { layers: present }) : [];
    map.getCanvas().style.cursor = hits.some((f) => f.properties?.name) ? "pointer" : "";
  });

  map.on("click", async (e) => {
    if (activeService === "tilequery") {
      const out = document.getElementById("tilequery-result");
      out.textContent = "Querying…";
      try {
        const r = await client.tilequery({ lon: e.lngLat.lng, lat: e.lngLat.lat, limit: 10 });
        out.innerHTML = tilequeryHtml(r.features);
      } catch (err) {
        showError(err);
      }
      return;
    }

    if (activeService !== "inspect") return;

    if (!toolPanel?.classList.contains("open")) {
      setActiveTool("inspect");
    }

    const present = TILE_LAYERS.filter((l) => map.getLayer(l));
    const features = present.length ? map.queryRenderedFeatures(e.point, { layers: present }) : [];
    panelBody.innerHTML = `<div>Reverse-geocoding…</div>${featuresHtml(features)}`;
    resultsEl.hidden = true;
    try {
      const result = await client.reverseGeocode({ lat: e.lngLat.lat, lon: e.lngLat.lng, lang: langOf() });
      panelBody.innerHTML = addressHtml(result) + featuresHtml(features);
    } catch (err) {
      showError(err);
    }
  });
}

init();
