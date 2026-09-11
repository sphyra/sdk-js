/**
 * Visual regression — Yerevan 2800th Anniversary Park (reference viewport area).
 * Run: SPHYRA_LOCAL_STACK=1 pnpm dev (in web-demo) + node --test visual-park.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";

const DEMO_URL = process.env.SPHYRA_DEMO_URL ?? "http://localhost:5173/";
const PARK = { lng: 44.5155, lat: 40.1798, zoom: 17.5, pitch: 60, bearing: -35 };

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

test("Anniversary Park shows tree canopy circles at high zoom (screenshot)", { skip }, async () => {
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
      const map = window.__SPHYRA_DEMO_MAP;
      map.jumpTo({ center: [lng, lat], zoom, pitch, bearing });
    }, PARK);

    await page.waitForTimeout(3500);

    await mkdir("screenshots", { recursive: true });
    await page.screenshot({ path: "screenshots/anniversary-park-3d.png" });

    const treeInfo = await page.evaluate(() => {
      const map = window.__SPHYRA_DEMO_MAP;
      const feats = map.querySourceFeatures("sphyra_trees", { sourceLayer: "trees" });
      return {
        hasCanopy: Boolean(map.getLayer("trees-canopy-mid")),
        treeCount: feats.length,
      };
    });
    assert.equal(treeInfo.hasCanopy, true, "trees-canopy-mid layer must be present");
    assert.ok(treeInfo.treeCount > 20, `expected tree features in viewport, got ${treeInfo.treeCount}`);

    assert.deepEqual(errors, [], `console errors:\n${errors.join("\n")}`);
  } finally {
    await browser.close();
  }
});
