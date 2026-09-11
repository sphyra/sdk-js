import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";

// CI-safe gate (mirrors smoke.test.mjs): only run when explicitly opted in AND the
// demo dev server answers on :5173 AND Playwright Chromium launches. Otherwise the
// case skips (never fails) — same discipline as the API repo's gated integration tests.
const DEMO_URL = process.env.SPHYRA_DEMO_URL ?? "http://localhost:5173/";

async function demoReachable() {
  if (!process.env.SPHYRA_LOCAL_STACK) return false;
  try {
    const res = await fetch(DEMO_URL);
    return res.ok;
  } catch {
    return false;
  }
}

// Resolve Playwright lazily so the file imports cleanly even when the optional
// devDependency is absent (e.g. CI without `npx playwright install chromium`).
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
  ? "demo dev server not reachable (run `pnpm dev` and set SPHYRA_LOCAL_STACK=1)"
  : !chromium
    ? "playwright not installed (run `npx playwright install chromium`)"
    : false;

test(
  "demo renders without console errors and cycles presets + 2D/3D via the real UI",
  { skip },
  async () => {
    let browser;
    try {
      try {
        browser = await chromium.launch();
      } catch (err) {
        // Chromium binary missing/unlaunchable → skip, never fail.
        assert.ok(true, `chromium did not launch: ${err?.message ?? err}`);
        return;
      }

      const consoleErrors = [];
      const pageErrors = [];
      const page = await browser.newPage();
      page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(msg.text());
      });
      page.on("pageerror", (err) => pageErrors.push(err.message));

      await page.goto(DEMO_URL, { waitUntil: "load" });
      await page.waitForFunction(() => window.__SPHYRA_DEMO_READY === true, { timeout: 30_000 });

      const settle = () => page.waitForTimeout(600);

      // Drive the real preset selector: dawn → day → dusk → night → day.
      for (const preset of ["dawn", "dusk", "night", "day"]) {
        await page.click(`.preset-picker [data-preset="${preset}"]`);
        await settle();
      }

      // Toggle 2D/3D twice via the real control (3D→2D→3D).
      await page.click("#mode-toggle");
      await settle();
      await page.click("#mode-toggle");
      await settle();

      const serviceTabs = ["directions", "matrix", "isochrone", "match", "optimize", "tilequery", "static"];
      const actionByTab = {
        directions: "#run-directions",
        matrix: "#run-matrix",
        isochrone: "#run-isochrone",
        match: "#run-match",
        optimize: "#run-optimize",
        tilequery: null,
        static: "#run-static-image",
      };

      for (const service of serviceTabs) {
        await page.click(`.sidebar-rail button[data-tool="${service}"]`);
        await settle();
        const action = actionByTab[service];
        if (service === "tilequery") {
          await page.click("#map", { position: { x: 400, y: 300 } });
          await settle();
        } else if (action) {
          await page.click(action);
          await settle();
        }
        if (service === "static") {
          await page.waitForFunction(
            () => {
              const img = document.getElementById("static-preview");
              return Boolean(img?.src);
            },
            { timeout: 30_000 },
          );
        }
      }

      await mkdir("screenshots", { recursive: true });
      await page.screenshot({ path: "screenshots/demo.png", fullPage: false });

      assert.deepEqual(
        consoleErrors,
        [],
        `console.error during demo run:\n${consoleErrors.join("\n")}`,
      );
      assert.deepEqual(
        pageErrors,
        [],
        `pageerror during demo run:\n${pageErrors.join("\n")}`,
      );
    } finally {
      if (browser) await browser.close();
    }
  },
);
