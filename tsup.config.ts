import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs", "iife"],
  globalName: "Sphyra",
  dts: true,
  clean: true,
  sourcemap: true,
  target: "es2020",
  external: ["maplibre-gl"],
  outExtension({ format }) {
    if (format === "iife") return { js: ".umd.js" };
    if (format === "cjs") return { js: ".cjs" };
    return { js: ".js" };
  },
});
