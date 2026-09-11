/** 3 Yerevan landmarks for matrix sources/targets [lon, lat]. */
export const MATRIX_SOURCES = [
  [44.5152, 40.1893], // Cascade
  [44.5136, 40.1772], // Republic Square
  [44.5028, 40.1936], // Opera
];
export const MATRIX_TARGETS = [
  [44.5136, 40.1772],
  [44.5152, 40.1893],
  [44.5264, 40.1878], // Matenadaran
];

/** Isochrone origin — Republic Square. */
export const ISOCHRONE_ORIGIN = [44.5136, 40.1772];

/** Noisy GPS trace (~Republic Sq → Cascade) for map matching, min 5 points [lon, lat]. */
export const MAP_MATCH_TRACE = [
  [44.5136, 40.1772],
  [44.5142, 40.1790],
  [44.5148, 40.1815],
  [44.5150, 40.1840],
  [44.5152, 40.1872],
  [44.5152, 40.1893],
];

/** Unordered delivery stops for optimization (shuffle in demo before call). */
export const OPTIMIZE_STOPS = [
  [44.5152, 40.1893],
  [44.5136, 40.1772],
  [44.5028, 40.1936],
  [44.5264, 40.1878],
];

/** Directions waypoints for the Directions control demo button. */
export const DIRECTIONS_WAYPOINTS = [
  [44.5152, 40.1893],
  [44.5136, 40.1772],
];
