// Sample Armenia/Yerevan data for the web demo's clustering layer and landmark markers.
// Local-only demo data — not user data, not PII. Coordinates are [lon, lat] (GeoJSON order).

/**
 * ~12 well-known Yerevan/Armenia POIs fed to `addClusterSource()` as a clustered
 * GeoJSON source. Each Feature is a Point with `{ name, category }` properties.
 *
 * @type {GeoJSON.FeatureCollection}
 */
export const SAMPLE_POINTS = {
  type: "FeatureCollection",
  features: [
    poi("Cascade Complex", "landmark", 44.5152, 40.1893),
    poi("Republic Square", "landmark", 44.5136, 40.1772),
    poi("Matenadaran", "museum", 44.5215, 40.1916),
    poi("Opera Theatre", "culture", 44.5147, 40.1853),
    poi("Victory Park", "park", 44.5215, 40.1990),
    poi("Tsitsernakaberd Memorial", "memorial", 44.4735, 40.1922),
    poi("Zvartnots Cathedral", "heritage", 44.3360, 40.1601),
    poi("Garni Temple", "heritage", 44.7300, 40.1122),
    poi("Geghard Monastery", "heritage", 44.8181, 40.1399),
    poi("Lake Sevan", "nature", 45.0282, 40.5640),
    poi("Khor Virap", "heritage", 44.5772, 39.8780),
    poi("Yerevan Zoo", "attraction", 44.5460, 40.2008),
  ],
};

/** Build a single POI Point Feature in [lon, lat] order. */
function poi(name, category, lon, lat) {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [lon, lat] },
    properties: { name, category },
  };
}

/**
 * 2–3 landmark markers for `addMarker()` + a bound `addPopup()`.
 * `lngLat` is [lon, lat]; `html` is the popup body.
 *
 * @type {Array<{ lngLat: [number, number], title: string, html: string }>}
 */
export const MARKERS = [
  {
    lngLat: [44.5152, 40.1893],
    title: "Cascade Complex",
    html: '<strong>Cascade Complex</strong><br>Giant limestone stairway &amp; the Cafesjian art collection.',
  },
  {
    lngLat: [44.5136, 40.1772],
    title: "Republic Square",
    html: '<strong>Republic Square</strong><br>Yerevan’s central square &amp; singing fountains.',
  },
  {
    lngLat: [44.5215, 40.1916],
    title: "Matenadaran",
    html: '<strong>Matenadaran</strong><br>Repository of ancient Armenian manuscripts.',
  },
];
