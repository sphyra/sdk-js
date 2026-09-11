import { describe, expect, it } from "vitest";
import { buildStaticImagePath } from "../src/staticImage";

describe("buildStaticImagePath", () => {
  it("center minimal → lon,lat,zoom/size.png", () => {
    expect(
      buildStaticImagePath({
        position: { kind: "center", lon: 44.51, lat: 40.18, zoom: 12 },
        width: 256,
        height: 256,
      }),
    ).toBe("44.51,40.18,12/256x256.png");
  });

  it("center with bearing/pitch → includes camera params", () => {
    expect(
      buildStaticImagePath({
        position: { kind: "center", lon: 44.51, lat: 40.18, zoom: 12, bearing: 30, pitch: 45 },
        width: 512,
        height: 256,
      }),
    ).toBe("44.51,40.18,12,30,45/512x256.png");
  });

  it("bbox → bracketed bounds segment", () => {
    expect(
      buildStaticImagePath({
        position: { kind: "bbox", minLon: 43.9, minLat: 40.0, maxLon: 44.7, maxLat: 40.4 },
        width: 256,
        height: 256,
      }),
    ).toBe("[43.9,40.0,44.7,40.4]/256x256.png");
  });

  it("retina → @2x before .png", () => {
    expect(
      buildStaticImagePath({
        position: { kind: "center", lon: 44.51, lat: 40.18, zoom: 12 },
        width: 256,
        height: 256,
        retina: true,
      }),
    ).toBe("44.51,40.18,12/256x256@2x.png");
  });

  it("preset+mode query → appended", () => {
    expect(
      buildStaticImagePath({
        position: { kind: "center", lon: 44.51, lat: 40.18, zoom: 12 },
        width: 256,
        height: 256,
        preset: "night",
        mode: "2d",
      }),
    ).toBe("44.51,40.18,12/256x256.png?preset=night&mode=2d");
  });

  it("overlay path → three-segment route", () => {
    expect(
      buildStaticImagePath({
        position: { kind: "center", lon: 44.51, lat: 40.18, zoom: 12 },
        width: 256,
        height: 256,
        overlay: "pin-s+ff0000(44.5,40.1)",
      }),
    ).toBe("pin-s+ff0000(44.5,40.1)/44.51,40.18,12/256x256.png");
  });
});
