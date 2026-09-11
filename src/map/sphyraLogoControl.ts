import maplibregl from "maplibre-gl";
import { SPHYRA_MARK_SVG } from "./sphyraMarkData.js";

export type ControlPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export interface SphyraLogoControlOptions {
  /** Logo image URL. Defaults to the bundled Sphyra mark (inline SVG data URI). */
  logoUrl?: string;
  /** Logo height in CSS pixels. Default 20. */
  size?: number;
  /** Optional link target when the logo is clicked. */
  href?: string;
}

/** Small Sphyra logo badge for the map corner (replaces MapLibre attribution). */
export class SphyraLogoControl implements maplibregl.IControl {
  private readonly options: Required<Pick<SphyraLogoControlOptions, "size">> &
    Pick<SphyraLogoControlOptions, "logoUrl" | "href">;
  private _container?: HTMLDivElement;

  constructor(options: SphyraLogoControlOptions = {}) {
    this.options = {
      logoUrl: options.logoUrl,
      href: options.href,
      size: options.size ?? 20,
    };
  }

  getDefaultPosition(): ControlPosition {
    return "bottom-right";
  }

  onAdd(_map: maplibregl.Map): HTMLElement {
    ensureLogoStyles();
    const root = document.createElement("div");
    root.className = "maplibregl-ctrl sphyra-logo-ctrl";

    const logoSrc =
      this.options.logoUrl ??
      `data:image/svg+xml;charset=utf-8,${encodeURIComponent(SPHYRA_MARK_SVG)}`;

    const inner = this.options.href
      ? document.createElement("a")
      : document.createElement("span");
    inner.className = "sphyra-logo-ctrl-inner";
    if (this.options.href && inner instanceof HTMLAnchorElement) {
      inner.href = this.options.href;
      inner.target = "_blank";
      inner.rel = "noopener noreferrer";
    }
    inner.setAttribute("aria-label", "Sphyra");

    const img = document.createElement("img");
    img.src = logoSrc;
    img.alt = "Sphyra";
    img.width = this.options.size;
    img.height = this.options.size;
    img.decoding = "async";
    img.draggable = false;

    inner.appendChild(img);
    root.appendChild(inner);
    this._container = root;
    return root;
  }

  onRemove(): void {
    this._container?.remove();
    this._container = undefined;
  }
}

/** Add the Sphyra corner logo. Returns the control for later removeControl. */
export function addSphyraLogoControl(
  map: maplibregl.Map,
  options?: SphyraLogoControlOptions,
  position: ControlPosition = "bottom-right",
): SphyraLogoControl {
  const control = new SphyraLogoControl(options);
  map.addControl(control, position);
  return control;
}

let stylesInjected = false;

function ensureLogoStyles(): void {
  if (stylesInjected || typeof document === "undefined") return;
  stylesInjected = true;
  const style = document.createElement("style");
  style.textContent = `
    .sphyra-logo-ctrl {
      background: rgba(255, 255, 255, 0.82);
      border-radius: 4px;
      padding: 2px 5px;
      box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.06);
    }
    .sphyra-logo-ctrl-inner {
      display: flex;
      align-items: center;
      line-height: 0;
      text-decoration: none;
    }
    .sphyra-logo-ctrl img {
      display: block;
    }
  `;
  document.head.appendChild(style);
}
