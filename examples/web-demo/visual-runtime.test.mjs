/**
 * Runtime preset/mode switch must match a freshly built style of the same variant.
 * Run: SPHYRA_LOCAL_STACK=1 pnpm dev + node --test visual-runtime.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";

const DEMO_URL = process.env.SPHYRA_DEMO_URL ?? "http://localhost:5173/";
const CENTER = { lng: 44.512843, lat: 40.177863, zoom: 16.94, pitch: 55, bearing: -12.8 };
const PIXEL_TOLERANCE = 0.02;

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

async function waitForIdle(page) {
  await page.waitForFunction(() => window.__SPHYRA_DEMO_READY === true, { timeout: 45_000 });
  const jump = () =>
    page.evaluate(({ lng, lat, zoom, pitch, bearing }) => {
      window.__SPHYRA_DEMO_MAP.jumpTo({ center: [lng, lat], zoom, pitch, bearing });
    }, CENTER);
  // The demo eases to the mode's default pitch right after load, which would override the first jump
  // and leave the two pages on different cameras.
  await jump();
  await page.waitForTimeout(1200);
  await jump();
  await page.waitForTimeout(3500);
}

async function paintSnapshot(page) {
  return page.evaluate(() => {
    const map = window.__SPHYRA_DEMO_MAP;
    const paintOf = (id, prop) => (map.getLayer(id) ? map.getPaintProperty(id, prop) : null);
    return {
      background: paintOf("background", "background-color"),
      buildings: paintOf("buildings-3d", "fill-extrusion-color"),
      water: paintOf("water-fill", "fill-color"),
      light: map.getLight(),
      vis: {
        buildings3d: map.getLayoutProperty("buildings-3d", "visibility"),
        buildingsFill: map.getLayoutProperty("buildings-fill", "visibility"),
      },
    };
  });
}

/**
 * Labels and badges are placed once and kept when a preset is switched at runtime, while a fresh map
 * re-runs collision — so symbol pixels differ by design (MapLibre behaviour, not a style mismatch).
 * The comparison is about paint: hide symbols on both pages first.
 */
async function hideSymbols(page) {
  await page.evaluate(() => {
    const map = window.__SPHYRA_DEMO_MAP;
    window.__HIDDEN_SYMBOLS__ = map
      .getStyle()
      .layers.filter((layer) => layer.type === "symbol")
      .map((layer) => layer.id);
    for (const id of window.__HIDDEN_SYMBOLS__) map.setLayoutProperty(id, "visibility", "none");
  });
  await page.waitForTimeout(2000);
}

async function showSymbols(page) {
  await page.evaluate(() => {
    const map = window.__SPHYRA_DEMO_MAP;
    for (const id of window.__HIDDEN_SYMBOLS__ ?? []) map.setLayoutProperty(id, "visibility", "visible");
  });
  await page.waitForTimeout(600);
}

async function mapPixels(page) {
  const box = await page.locator("#map").boundingBox();
  const png = await page.screenshot({
    type: "png",
    clip: { x: box.x, y: box.y, width: 720, height: 480 },
  });
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    return Array.from(ctx.getImageData(0, 0, img.width, img.height).data);
  }, png.toString("base64"));
}

function mismatchRatio(left, right) {
  const n = Math.min(left.length, right.length);
  let bad = 0;
  for (let i = 0; i < n; i += 4) {
    const d = Math.max(
      Math.abs(left[i] - right[i]),
      Math.abs(left[i + 1] - right[i + 1]),
      Math.abs(left[i + 2] - right[i + 2]),
    );
    if (d > 16) bad += 1;
  }
  return bad / (n / 4);
}

test("runtime day→night→day is pixel-equal to fresh builds; 2D/3D toggle", { skip }, async () => {
  const browser = await chromium.launch();
  try {
    const runtime = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await runtime.goto(DEMO_URL, { waitUntil: "load" });
    await waitForIdle(runtime);
    const dayRuntimeStart = await paintSnapshot(runtime);
    await hideSymbols(runtime);
    const dayRuntimePixels = await mapPixels(runtime);
    await showSymbols(runtime);

    await runtime.click('.preset-picker [data-preset="night"]');
    await runtime.waitForTimeout(2000);
    // The demo re-applies the mode on a preset switch, which eases the pitch back to the 3D default.
    await waitForIdle(runtime);
    const nightRuntimePaint = await paintSnapshot(runtime);
    await hideSymbols(runtime);
    const nightRuntimePixels = await mapPixels(runtime);
    await showSymbols(runtime);

    const nightFresh = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await nightFresh.goto(`${DEMO_URL}?preset=night`, { waitUntil: "load" });
    await waitForIdle(nightFresh);
    const nightFreshPaint = await paintSnapshot(nightFresh);
    await hideSymbols(nightFresh);
    const nightFreshPixels = await mapPixels(nightFresh);

    assert.equal(nightRuntimePaint.background, nightFreshPaint.background);
    assert.equal(nightRuntimePaint.buildings, nightFreshPaint.buildings);
    assert.equal(nightRuntimePaint.water, nightFreshPaint.water);
    assert.deepEqual(nightRuntimePaint.light, nightFreshPaint.light);
    assert.ok(
      mismatchRatio(nightRuntimePixels, nightFreshPixels) <= PIXEL_TOLERANCE,
      "runtime night must match a fresh night build",
    );

    await runtime.click('.preset-picker [data-preset="day"]');
    await runtime.waitForTimeout(2000);
    await waitForIdle(runtime);
    const dayRoundTripPaint = await paintSnapshot(runtime);
    await hideSymbols(runtime);
    const dayRoundTripPixels = await mapPixels(runtime);
    await showSymbols(runtime);
    assert.equal(dayRoundTripPaint.background, dayRuntimeStart.background);
    assert.equal(dayRoundTripPaint.buildings, dayRuntimeStart.buildings);
    assert.ok(
      mismatchRatio(dayRoundTripPixels, dayRuntimePixels) <= PIXEL_TOLERANCE,
      "day → night → day must match the original day pixels",
    );

    await runtime.click("#mode-toggle");
    await runtime.waitForTimeout(1500);
    const twoD = await paintSnapshot(runtime);
    assert.equal(twoD.vis.buildings3d, "none");
    assert.equal(twoD.vis.buildingsFill, "visible");

    await runtime.click("#mode-toggle");
    await runtime.waitForTimeout(1500);
    const threeD = await paintSnapshot(runtime);
    assert.equal(threeD.vis.buildings3d, "visible");
    assert.equal(threeD.vis.buildingsFill, "none");

    await mkdir("screenshots", { recursive: true });
    await runtime.screenshot({ path: "screenshots/runtime-day-roundtrip.png" });
    await nightFresh.screenshot({ path: "screenshots/runtime-night-fresh.png" });
  } finally {
    await browser.close();
  }
});
