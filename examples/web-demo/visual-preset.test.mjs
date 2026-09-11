/**
 * Capture dawn / day / dusk / night screenshots + verify POI category colors and building presets.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";

const DEMO_URL = process.env.SPHYRA_DEMO_URL ?? "http://localhost:5173/";
const CENTER = { lng: 44.5152, lat: 40.1872, zoom: 18.2, pitch: 55, bearing: -25 };

async function demoReachable() {
  try {
    const res = await fetch(DEMO_URL);
    return res.ok;
  } catch {
    return false;
  }
}

async function loadChromium() {
  try {
    const { chromium } = await import("playwright");
    return chromium;
  } catch {
    return null;
  }
}

const up = await demoReachable();
const chromium = up ? await loadChromium() : null;
const skip = !up ? "demo dev server not reachable" : !chromium ? "playwright not installed" : false;

for (const preset of ["dawn", "day", "dusk", "night"]) {
  test(`preset ${preset} — buildings + POI screenshot`, { skip }, async () => {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      await page.goto(DEMO_URL, { waitUntil: "load" });
      await page.waitForFunction(() => window.__SPHYRA_DEMO_READY === true, { timeout: 45_000 });

      await page.click(`.preset-picker [data-preset="${preset}"]`);
      await page.waitForTimeout(1500);

      await page.evaluate(({ lng, lat, zoom, pitch, bearing }) => {
        window.__SPHYRA_DEMO_MAP.jumpTo({ center: [lng, lat], zoom, pitch, bearing });
      }, CENTER);

      await page.waitForTimeout(4000);

      await mkdir("screenshots", { recursive: true });
      await page.screenshot({ path: `screenshots/preset-${preset}.png` });

      const info = await page.evaluate((p) => {
        const map = window.__SPHYRA_DEMO_MAP;
        const style = map.getStyle();
        const b3 = style.layers.find((l) => l.id === "buildings-3d");
        const pc = style.layers.find((l) => l.id === "pois-circle");
        const bg = style.layers.find((l) => l.id === "background");
        const pois = map.queryRenderedFeatures(undefined, { layers: ["pois-circle"] }).slice(0, 40);
        const colors = new Set(pois.map((f) => {
          const cat = f.properties?.amenity || f.properties?.shop || f.properties?.tourism || "?";
          return `${cat}`;
        }));
        return {
          buildingColor: b3?.paint?.["fill-extrusion-color"],
          poiCirclePaint: pc?.paint?.["circle-color"],
          background: bg?.paint?.["background-color"],
          poiCategories: [...colors],
          hasPoiIconLayer: Boolean(map.getLayer("pois-icon")),
        };
      }, preset);

      assert.ok(info.hasPoiIconLayer, "pois-icon layer missing");
      assert.notEqual(info.poiCirclePaint, "#4264fb", "POI circles must not be flat blue");
      assert.ok(Array.isArray(info.poiCirclePaint) || typeof info.poiCirclePaint === "object", "POI color must be expression");

      const b3Vis = await page.evaluate(() => {
        const map = window.__SPHYRA_DEMO_MAP;
        return map.getLayoutProperty("buildings-3d", "visibility");
      });
      assert.equal(b3Vis, "visible", "buildings-3d must stay visible in 3D mode");

      if (preset === "dawn") assert.equal(info.buildingColor, "#ebe4da");
      if (preset === "day") assert.equal(info.buildingColor, "#f2ece4");
      if (preset === "dusk") assert.equal(info.buildingColor, "#6a656e");
      if (preset === "night") assert.equal(info.buildingColor, "#2a2a32");
    } finally {
      await browser.close();
    }
  });
}
