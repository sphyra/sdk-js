import { defineConfig } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SDK_DIST = path.resolve(__dirname, "../../dist/index.js");

// The Sphyra API has no CORS middleware, so the browser must never call it cross-origin.
// Vite serves the demo and proxies API/tile/health requests to the local stack server-side.
const API_TARGET = process.env.SPHYRA_PROXY_TARGET ?? "http://localhost:4000";

export default defineConfig({
  resolve: {
    alias: {
      "@sphyra/js": SDK_DIST,
    },
  },
  optimizeDeps: {
    // Local file: dependency — always load fresh dist, never a stale prebundle.
    exclude: ["@sphyra/js"],
  },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: API_TARGET, changeOrigin: true },
      "/tiles": { target: API_TARGET, changeOrigin: true },
      "/health": { target: API_TARGET, changeOrigin: true },
    },
  },
});
