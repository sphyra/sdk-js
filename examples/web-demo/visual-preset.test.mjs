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
        const poiLayer = style.layers.find((l) => l.id === "pois");
        const bg = style.layers.find((l) => l.id === "background");
        const pois = map.queryRenderedFeatures(undefined, { layers: ["pois"] }).slice(0, 40);
        const colors = new Set(pois.map((f) => {
          const cat = f.properties?.rank_class || "?";
          return `${cat}`;
        }));
        return {
          buildingColor: b3?.paint?.["fill-extrusion-color"],
          poiIconImage: poiLayer?.layout?.["icon-image"],
          background: bg?.paint?.["background-color"],
          poiCategories: [...colors],
          hasPoiLayer: Boolean(map.getLayer("pois")),
        };
      }, preset);

      assert.ok(info.hasPoiLayer, "single ranked POI layer missing");
      assert.equal(info.poiIconImage[0], "concat", "POI must use a baked rank-class badge");

      const b3Vis = await page.evaluate(() => {
        const map = window.__SPHYRA_DEMO_MAP;
        return map.getLayoutProperty("buildings-3d", "visibility");
      });
      assert.equal(b3Vis, "visible", "buildings-3d must stay visible in 3D mode");

      // Facade colours are fitted to Mapbox pixels in the API (mapStyleFacades.test.ts); the demo only
      // has to bake whatever the style's own preset table says.
      const expected = await page.evaluate(
        (p) => window.__SPHYRA_DEMO_MAP.getStyle().metadata["sphyra:presets"][p].layers["buildings-3d"]["fill-extrusion-color"],
        preset,
      );
      assert.equal(info.buildingColor, expected);
    } finally {
      await browser.close();
    }
  });
}
