import { SphyraError } from "./errors";
import type {
  DirectionsParams,
  DirectionsResult,
  GeocodeLang,
  GeocodeResult,
  HealthStatus,
  IsochroneParams,
  IsochroneResult,
  MapMatchParams,
  MapMatchResult,
  MatrixParams,
  MatrixResult,
  OptimizationParams,
  OptimizationResult,
  ReverseGeocodeResult,
  SearchCategoryParams,
  SearchCategoryResult,
  SearchForwardParams,
  SearchForwardResult,
  SearchRetrieveParams,
  SearchRetrieveResult,
  SearchSuggestParams,
  SearchSuggestResult,
  SphyraStyle,
  StyleMode,
  StylePreset,
  TileConfigResponse,
  TilequeryParams,
  TilequeryResult,
  StaticImageUrlParams,
} from "./types";
import { buildStaticImagePath } from "./staticImage";

export interface SphyraClientOptions {
  baseUrl: string;
  apiKey: string;
  timeout?: number; // default 10000ms
}

interface ErrorEnvelope {
  error?: { code?: string; message?: string };
}

const DEFAULT_TIMEOUT_MS = 10000;

export class SphyraClient {
  constructor(private opts: SphyraClientOptions) {}

  reverseGeocode(params: {
    lat: number;
    lon: number;
    lang?: GeocodeLang;
  }): Promise<ReverseGeocodeResult> {
    const body = { lat: params.lat, lon: params.lon, lang: params.lang ?? "hy" };
    return this.withRetry(() =>
      this.request<ReverseGeocodeResult>("/api/v1/geocode/reverse", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    );
  }

  forwardGeocode(params: {
    q: string;
    lang?: GeocodeLang;
    limit?: number;
  }): Promise<GeocodeResult[]> {
    const query = new URLSearchParams({ q: params.q });
    if (params.lang !== undefined) query.set("lang", params.lang);
    if (params.limit !== undefined) query.set("limit", String(params.limit));
    return this.withRetry(() =>
      this.request<GeocodeResult[]>(`/api/v1/geocode/search?${query.toString()}`, {
        method: "GET",
      }),
    );
  }

  directions(params: DirectionsParams): Promise<DirectionsResult> {
    // Send optional params only when provided (mirrors forwardGeocode's lang/limit);
    // the API applies the documented defaults for anything omitted.
    const body: Record<string, unknown> = { waypoints: params.waypoints };
    if (params.profile !== undefined) body["profile"] = params.profile;
    if (params.alternatives !== undefined) body["alternatives"] = params.alternatives;
    if (params.steps !== undefined) body["steps"] = params.steps;
    if (params.language !== undefined) body["language"] = params.language;
    if (params.geometries !== undefined) body["geometries"] = params.geometries;
    return this.withRetry(() =>
      this.request<DirectionsResult>("/api/v1/directions", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    );
  }

  matrix(params: MatrixParams): Promise<MatrixResult> {
    // Send optional params only when provided (mirrors directions()); the API
    // applies the documented defaults for anything omitted.
    const body: Record<string, unknown> = { sources: params.sources, targets: params.targets };
    if (params.profile !== undefined) body["profile"] = params.profile;
    if (params.annotations !== undefined) body["annotations"] = params.annotations;
    return this.withRetry(() =>
      this.request<MatrixResult>("/api/v1/matrix", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    );
  }

  isochrone(params: IsochroneParams): Promise<IsochroneResult> {
    // Send optional params only when provided (mirrors matrix()); the API applies the
    // documented defaults for anything omitted.
    const body: Record<string, unknown> = { origin: params.origin };
    if (params.profile !== undefined) body["profile"] = params.profile;
    if (params.contoursMinutes !== undefined) body["contoursMinutes"] = params.contoursMinutes;
    if (params.contoursMeters !== undefined) body["contoursMeters"] = params.contoursMeters;
    if (params.contoursColors !== undefined) body["contoursColors"] = params.contoursColors;
    if (params.polygons !== undefined) body["polygons"] = params.polygons;
    if (params.denoise !== undefined) body["denoise"] = params.denoise;
    if (params.generalize !== undefined) body["generalize"] = params.generalize;
    return this.withRetry(() =>
      this.request<IsochroneResult>("/api/v1/isochrone", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    );
  }

  mapMatch(params: MapMatchParams): Promise<MapMatchResult> {
    // Send optional params only when provided (mirrors matrix()); the API applies the
    // documented defaults for anything omitted. Coordinates are PII — never logged.
    const body: Record<string, unknown> = { coordinates: params.coordinates };
    if (params.timestamps !== undefined) body["timestamps"] = params.timestamps;
    if (params.radiuses !== undefined) body["radiuses"] = params.radiuses;
    if (params.profile !== undefined) body["profile"] = params.profile;
    if (params.tidy !== undefined) body["tidy"] = params.tidy;
    if (params.geometries !== undefined) body["geometries"] = params.geometries;
    if (params.language !== undefined) body["language"] = params.language;
    if (params.steps !== undefined) body["steps"] = params.steps;
    return this.withRetry(() =>
      this.request<MapMatchResult>("/api/v1/map-matching", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    );
  }

  optimize(params: OptimizationParams): Promise<OptimizationResult> {
    // Send optional params only when provided (mirrors matrix()); the API applies
    // the documented defaults for anything omitted.
    const body: Record<string, unknown> = { waypoints: params.waypoints };
    if (params.profile !== undefined) body["profile"] = params.profile;
    if (params.source !== undefined) body["source"] = params.source;
    if (params.destination !== undefined) body["destination"] = params.destination;
    if (params.roundtrip !== undefined) body["roundtrip"] = params.roundtrip;
    if (params.geometries !== undefined) body["geometries"] = params.geometries;
    if (params.language !== undefined) body["language"] = params.language;
    if (params.steps !== undefined) body["steps"] = params.steps;
    return this.withRetry(() =>
      this.request<OptimizationResult>("/api/v1/optimization", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    );
  }

  tilequery(params: TilequeryParams): Promise<TilequeryResult> {
    // Send optional params only when provided; the API applies the documented defaults.
    const query = new URLSearchParams();
    if (params.radius !== undefined) query.set("radius", String(params.radius));
    if (params.limit !== undefined) query.set("limit", String(params.limit));
    if (params.layers !== undefined) query.set("layers", params.layers.join(","));
    if (params.dedupe !== undefined) query.set("dedupe", String(params.dedupe));
    const qs = query.toString();
    const suffix = qs ? `?${qs}` : "";
    return this.withRetry(() =>
      this.request<TilequeryResult>(`/api/v1/tilequery/${params.lon},${params.lat}${suffix}`, {
        method: "GET",
      }),
    );
  }

  searchSuggest(params: SearchSuggestParams): Promise<SearchSuggestResult> {
    const query = new URLSearchParams({ q: params.q });
    if (params.lang !== undefined) query.set("lang", params.lang);
    if (params.limit !== undefined) query.set("limit", String(params.limit));
    if (params.proximity !== undefined) query.set("proximity", params.proximity.join(","));
    if (params.sessionToken !== undefined) query.set("session_token", params.sessionToken);
    return this.withRetry(() =>
      this.request<SearchSuggestResult>(`/api/v1/search/suggest?${query.toString()}`, { method: "GET" }),
    );
  }

  searchRetrieve(params: SearchRetrieveParams): Promise<SearchRetrieveResult> {
    const query = new URLSearchParams({ id: params.id });
    if (params.lang !== undefined) query.set("lang", params.lang);
    if (params.sessionToken !== undefined) query.set("session_token", params.sessionToken);
    return this.withRetry(() =>
      this.request<SearchRetrieveResult>(`/api/v1/search/retrieve?${query.toString()}`, { method: "GET" }),
    );
  }

  searchCategory(params: SearchCategoryParams): Promise<SearchCategoryResult> {
    const query = new URLSearchParams({ category: params.category });
    if (params.proximity !== undefined) query.set("proximity", params.proximity.join(","));
    if (params.bbox !== undefined) query.set("bbox", params.bbox.join(","));
    if (params.radius !== undefined) query.set("radius", String(params.radius));
    if (params.limit !== undefined) query.set("limit", String(params.limit));
    if (params.lang !== undefined) query.set("lang", params.lang);
    return this.withRetry(() =>
      this.request<SearchCategoryResult>(`/api/v1/search/category?${query.toString()}`, { method: "GET" }),
    );
  }

  searchForward(params: SearchForwardParams): Promise<SearchForwardResult> {
    const query = new URLSearchParams();
    if (params.q !== undefined) query.set("q", params.q);
    if (params.street !== undefined) query.set("street", params.street);
    if (params.city !== undefined) query.set("city", params.city);
    if (params.postalcode !== undefined) query.set("postalcode", params.postalcode);
    if (params.proximity !== undefined) query.set("proximity", params.proximity.join(","));
    if (params.limit !== undefined) query.set("limit", String(params.limit));
    if (params.lang !== undefined) query.set("lang", params.lang);
    return this.withRetry(() =>
      this.request<SearchForwardResult>(`/api/v1/search/forward?${query.toString()}`, { method: "GET" }),
    );
  }

  getTileConfig(): Promise<TileConfigResponse> {
    return this.withRetry(() =>
      this.request<TileConfigResponse>("/api/v1/tile-config", { method: "GET" }),
    );
  }

  /** Public base URL of this client (non-secret) — used by createSphyraMap's transformRequest. */
  get baseUrl(): string {
    return this.opts.baseUrl;
  }

  /** Bearer auth header for signing MapLibre requests in-process (never logged, never returned to UI). */
  authHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${this.opts.apiKey}` };
  }

  /**
   * Fetch the signed MapLibre Standard style (S-1.0.0-10-012). The returned style always carries
   * `metadata["sphyra:presets"|"sphyra:modes"]` for runtime Day/Dusk/Night + 2D/3D switching with
   * no re-fetch. `preset`/`mode` bake a server-side variant (for non-GL consumers); the SDK map
   * surfaces fetch once with no params and switch locally.
   */
  getMapStyle(opts: { preset?: StylePreset; mode?: StyleMode } = {}): Promise<SphyraStyle> {
    const query = new URLSearchParams();
    if (opts.preset !== undefined) query.set("preset", opts.preset);
    if (opts.mode !== undefined) query.set("mode", opts.mode);
    const qs = query.toString();
    const suffix = qs ? `?${qs}` : "";
    return this.withRetry(() =>
      this.request<SphyraStyle>(`/api/v1/map-style.json${suffix}`, { method: "GET" }),
    );
  }

  async healthCheck(): Promise<{ status: HealthStatus }> {
    const report = await this.withRetry(() =>
      this.request<{ status: HealthStatus }>("/health", { method: "GET" }),
    );
    return { status: report.status };
  }

  /** Build a full static-image URL (no network). Auth is required to fetch the PNG. */
  staticImageUrl(params: StaticImageUrlParams): string {
    return `${this.opts.baseUrl}/api/v1/static/${buildStaticImagePath(params)}`;
  }

  /** Authenticated GET for a static map PNG (Bearer required — cannot use <img src> alone). */
  async fetchStaticImage(params: StaticImageUrlParams): Promise<Blob> {
    const url = this.staticImageUrl(params);
    let res: Response;
    try {
      res = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.opts.apiKey}`,
          Accept: "image/png",
        },
        signal: AbortSignal.timeout(this.opts.timeout ?? DEFAULT_TIMEOUT_MS),
      });
    } catch (err) {
      const name = (err as { name?: string } | undefined)?.name;
      if (name === "AbortError" || name === "TimeoutError") {
        throw new SphyraError("TIMEOUT", "Request timed out");
      }
      const message = err instanceof Error ? err.message : "Network request failed";
      throw new SphyraError("NETWORK", message);
    }

    if (res.ok) {
      return res.blob();
    }

    let code = "HTTP_ERROR";
    let message = res.statusText;
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("json")) {
      try {
        const parsed = (await res.json()) as ErrorEnvelope;
        if (parsed.error && typeof parsed.error.code === "string") {
          code = parsed.error.code;
          message = parsed.error.message ?? message;
        }
      } catch {
        // Non-JSON error body — keep HTTP_ERROR fallback.
      }
    }
    throw new SphyraError(code, message, res.status);
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const url = `${this.opts.baseUrl}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.opts.apiKey}`,
    };
    if (options?.body !== undefined && options.body !== null) {
      headers["Content-Type"] = "application/json";
      headers["Accept"] = "application/json";
    }

    let res: Response;
    try {
      res = await fetch(url, {
        ...options,
        headers: {
          ...headers,
          ...(options?.headers as Record<string, string> | undefined),
        },
        signal: AbortSignal.timeout(this.opts.timeout ?? DEFAULT_TIMEOUT_MS),
      });
    } catch (err) {
      const name = (err as { name?: string } | undefined)?.name;
      if (name === "AbortError" || name === "TimeoutError") {
        throw new SphyraError("TIMEOUT", "Request timed out");
      }
      const message = err instanceof Error ? err.message : "Network request failed";
      throw new SphyraError("NETWORK", message);
    }

    if (res.ok) {
      return (await res.json()) as T;
    }

    let code = "HTTP_ERROR";
    let message = res.statusText;
    try {
      const parsed = (await res.json()) as ErrorEnvelope;
      if (parsed.error && typeof parsed.error.code === "string") {
        code = parsed.error.code;
        message = parsed.error.message ?? message;
      }
    } catch {
      // Response body was not the expected JSON envelope; keep HTTP_ERROR fallback.
    }
    throw new SphyraError(code, message, res.status);
  }

  private async withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err;
        const retryable =
          err instanceof SphyraError &&
          ((err.statusCode !== undefined && err.statusCode >= 500) ||
            err.code === "TIMEOUT" ||
            err.code === "NETWORK");
        if (!retryable || attempt === maxRetries) {
          throw err;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
      }
    }
    throw lastError;
  }
}
