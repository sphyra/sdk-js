import maplibregl from "maplibre-gl";

export interface ClusterStyleOptions {
  clusterRadius?: number; // default 50
  clusterMaxZoom?: number; // default 14
  clusterColor?: string; // default "#1d4ed8"
  clusterTextColor?: string; // default "#ffffff"
  pointColor?: string; // default "#2563eb"
  pointRadius?: number; // default 6
}

export interface AddClusterSourceOptions extends ClusterStyleOptions {
  /** GeoJSON FeatureCollection of points, or a URL to one. */
  data: GeoJSON.FeatureCollection | string;
  /** Fired when an individual (unclustered) point is clicked. */
  onPointClick?: (feature: GeoJSON.Feature, lngLat: [number, number]) => void;
}

export interface SphyraClusterHandle {
  sourceId: string;
  layerIds: { clusters: string; clusterCount: string; unclustered: string };
  setData(data: GeoJSON.FeatureCollection | string): void;
  remove(): void;
}

export const DEFAULT_CLUSTER_RADIUS = 50;
export const DEFAULT_CLUSTER_MAX_ZOOM = 14;

/**
 * Wire a clustered GeoJSON source + cluster / cluster-count / unclustered layers, with
 * click-to-zoom cluster expansion and an optional point-click handler. No network, no client.
 */
export function addClusterSource(
  map: maplibregl.Map,
  sourceId: string,
  options: AddClusterSourceOptions,
): SphyraClusterHandle {
  const clusterColor = options.clusterColor ?? "#1d4ed8";
  const clusterTextColor = options.clusterTextColor ?? "#ffffff";
  const pointColor = options.pointColor ?? "#2563eb";
  const pointRadius = options.pointRadius ?? 6;

  const clustersLayer = `${sourceId}-clusters`;
  const clusterCountLayer = `${sourceId}-cluster-count`;
  const unclusteredLayer = `${sourceId}-unclustered`;

  map.addSource(sourceId, {
    type: "geojson",
    data: options.data,
    cluster: true,
    clusterRadius: options.clusterRadius ?? DEFAULT_CLUSTER_RADIUS,
    clusterMaxZoom: options.clusterMaxZoom ?? DEFAULT_CLUSTER_MAX_ZOOM,
  } as maplibregl.SourceSpecification);

  map.addLayer({
    id: clustersLayer,
    type: "circle",
    source: sourceId,
    filter: ["has", "point_count"],
    paint: {
      "circle-color": clusterColor,
      "circle-radius": ["step", ["get", "point_count"], 16, 25, 22, 100, 30],
    },
  } as maplibregl.LayerSpecification);

  map.addLayer({
    id: clusterCountLayer,
    type: "symbol",
    source: sourceId,
    filter: ["has", "point_count"],
    layout: {
      "text-field": ["get", "point_count_abbreviated"],
      "text-size": 12,
      "text-font": ["Noto Sans Regular"],
    },
    paint: { "text-color": clusterTextColor },
  } as maplibregl.LayerSpecification);

  map.addLayer({
    id: unclusteredLayer,
    type: "circle",
    source: sourceId,
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-color": pointColor,
      "circle-radius": pointRadius,
      "circle-stroke-width": 1,
      "circle-stroke-color": "#ffffff",
    },
  } as maplibregl.LayerSpecification);

  // Click a cluster → zoom to its expansion level.
  map.on("click", clustersLayer, (e) => {
    const features = map.queryRenderedFeatures(e.point, { layers: [clustersLayer] });
    const feature = features[0];
    if (!feature) return;
    const clusterId = feature.properties?.["cluster_id"] as number;
    const source = map.getSource(sourceId) as maplibregl.GeoJSONSource;
    source.getClusterExpansionZoom(clusterId).then((zoom) => {
      const coords = (feature.geometry as GeoJSON.Point).coordinates as [number, number];
      map.easeTo({ center: coords, zoom });
    });
  });

  // Click an individual point → consumer callback.
  if (options.onPointClick) {
    map.on("click", unclusteredLayer, (e) => {
      const features = map.queryRenderedFeatures(e.point, { layers: [unclusteredLayer] });
      const feature = features[0];
      if (!feature) return;
      const coords = (feature.geometry as GeoJSON.Point).coordinates as [number, number];
      options.onPointClick!(feature as unknown as GeoJSON.Feature, coords);
    });
  }

  // Pointer cursor over clusters.
  map.on("mouseenter", clustersLayer, () => {
    map.getCanvas().style.cursor = "pointer";
  });
  map.on("mouseleave", clustersLayer, () => {
    map.getCanvas().style.cursor = "";
  });

  return {
    sourceId,
    layerIds: { clusters: clustersLayer, clusterCount: clusterCountLayer, unclustered: unclusteredLayer },
    setData(data) {
      (map.getSource(sourceId) as maplibregl.GeoJSONSource).setData(
        data as GeoJSON.FeatureCollection,
      );
    },
    remove() {
      map.removeLayer(clustersLayer);
      map.removeLayer(clusterCountLayer);
      map.removeLayer(unclusteredLayer);
      map.removeSource(sourceId);
    },
  };
}
