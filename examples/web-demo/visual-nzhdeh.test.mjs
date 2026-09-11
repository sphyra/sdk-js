/**
 * Garegin Nzhdeh Square — must show the 2 plaza trees + neighbour street trees at z19.
 * Reference viewport: Garegin Nzhdeh Square, Yerevan z19
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";

const DEMO_URL = process.env.SPHYRA_DEMO_URL ?? "http://localhost:5173/";
const NZHDEH = { lng: 44.4832107, lat: 40.1514067, zoom: 19.09, pitch: 62, bearing: -20 };

async function demoReachable() {
  if (!process.env.SPHYRA_LOCAL_STACK) return false;
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
const skip = !up
  ? "demo dev server not reachable"
  : !chromium
    ? "playwright not installed"
    : false;

test("Nzhdeh Square shows plaza trees at z19 (screenshot)", { skip }, async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto(DEMO_URL, { waitUntil: "load" });
    await page.waitForFunction(() => window.__SPHYRA_DEMO_READY === true, { timeout: 45_000 });

    await page.evaluate(({ lng, lat, zoom, pitch, bearing }) => {
      window.__SPHYRA_DEMO_MAP.jumpTo({ center: [lng, lat], zoom, pitch, bearing });
    }, NZHDEH);

    await page.waitForFunction(
      () => {
        if (typeof window.__SPHYRA_COUNT_TREES_NEAR !== "function") return false;
        return window.__SPHYRA_COUNT_TREES_NEAR(44.48321, 40.15136, 0.0002) >= 2;
      },
      { timeout: 45_000 },
    );

    await page.waitForTimeout(3000);

    await mkdir("screenshots", { recursive: true });
    await page.screenshot({ path: "screenshots/nzhdeh-square.png" });

    const info = await page.evaluate(() => {
      const map = window.__SPHYRA_DEMO_MAP;
      const feats = map.querySourceFeatures("sphyra_trees", { sourceLayer: "trees" });
      const squareTrees =
        typeof window.__SPHYRA_COUNT_TREES_NEAR === "function"
          ? window.__SPHYRA_COUNT_TREES_NEAR(44.48321, 40.15136, 0.00015)
          : 0;
      const src = map.getStyle().sources.sphyra_trees;
      return {
        treeCount: feats.length,
        squareTrees,
        treesMaxzoom: src?.maxzoom,
        hasCanopy: Boolean(map.getLayer("trees-canopy-mid")),
        pedestrian: map.queryRenderedFeatures({ layers: ["landuse-fill"] }).some(
          (f) => f.properties?.class === "pedestrian",
        ),
      };
    });

    assert.ok(info.treesMaxzoom >= 20, `trees source maxzoom should be 20, got ${info.treesMaxzoom}`);
    assert.ok(info.treeCount > 10, `expected street trees nearby, got ${info.treeCount}`);
    assert.ok(info.squareTrees >= 2, `expected 2 plaza trees, got ${info.squareTrees}`);
    assert.equal(info.hasCanopy, true, "trees-canopy-mid layer must be active");
    assert.deepEqual(errors, [], `console errors:\n${errors.join("\n")}`);
  } finally {
    await browser.close();
  }
});
