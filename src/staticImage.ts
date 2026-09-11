import type { StaticImagePosition, StaticImageUrlParams } from "./types";

function fmtCoord(n: number): string {
  return Number.isInteger(n) ? n.toFixed(1) : String(n);
}

function positionSegment(position: StaticImagePosition): string {
  if (position.kind === "bbox") {
    return `[${fmtCoord(position.minLon)},${fmtCoord(position.minLat)},${fmtCoord(position.maxLon)},${fmtCoord(position.maxLat)}]`;
  }
  const bearing = position.bearing ?? 0;
  const pitch = position.pitch ?? 0;
  if (bearing !== 0 || pitch !== 0) {
    return `${position.lon},${position.lat},${position.zoom},${bearing},${pitch}`;
  }
  return `${position.lon},${position.lat},${position.zoom}`;
}

/** Build the path+query portion after `/api/v1/static/` (no leading slash). */
export function buildStaticImagePath(params: StaticImageUrlParams): string {
  const position = positionSegment(params.position);
  const size = `${params.width}x${params.height}${params.retina ? "@2x" : ""}.png`;
  const path = params.overlay ? `${params.overlay}/${position}/${size}` : `${position}/${size}`;

  const query = new URLSearchParams();
  if (params.preset !== undefined) query.set("preset", params.preset);
  if (params.mode !== undefined) query.set("mode", params.mode);
  const qs = query.toString();
  return qs ? `${path}?${qs}` : path;
}
