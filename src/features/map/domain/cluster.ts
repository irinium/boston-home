import { type LatLng, MIN_BOX_KM, KM_IN_DEGREES, normalizeLongitude, type Region } from './geo';

export type MapPoint = LatLng & { id: string };

/** One marker on the map: a single listing (`ids.length === 1`) or a group of nearby ones. */
export type Cluster = LatLng & { key: string; ids: string[] };

/** Grid cells across the visible width. Fewer cells means bigger, fewer clusters. */
export const CELLS_ACROSS = 6;

/**
 * Grid clustering: O(n) and deterministic, which is plenty for the few hundred points one map
 * query returns. Cells are square on screen: in Web Mercator a degree of latitude looks
 * 1 / cos(latitude) times taller than a degree of longitude, so cells are shortened in latitude.
 * Each cluster sits at the average of its points.
 */
export function clusterPoints(points: readonly MapPoint[], region: Region, cellsAcross = CELLS_ACROSS): Cluster[] {
  const cellLng = Math.max(Math.min(region.longitudeDelta, 360) / cellsAcross, 1e-6);
  const cellLat = Math.max(cellLng * Math.cos((region.latitude * Math.PI) / 180), 1e-6);

  const cells = new Map<string, { lat: number; lng: number; ids: string[] }>();
  for (const point of points) {
    const lng = normalizeLongitude(point.longitude);
    const key = `${Math.floor(point.latitude / cellLat)}:${Math.floor((lng + 180) / cellLng)}`;
    const cell = cells.get(key);
    if (cell) {
      cell.lat += point.latitude;
      cell.lng += lng;
      cell.ids.push(point.id);
    } else {
      cells.set(key, { lat: point.latitude, lng, ids: [point.id] });
    }
  }

  return [...cells.entries()]
    .map(([key, c]) => ({ key, latitude: c.lat / c.ids.length, longitude: c.lng / c.ids.length, ids: c.ids }))
    .sort((a, b) => b.ids.length - a.ids.length || a.key.localeCompare(b.key));
}

/** What tapping a marker does. */
export type ClusterAction =
  | { type: 'open'; id: string }
  | { type: 'zoom'; region: Region }
  | { type: 'list'; ids: string[] };

/**
 * Below this width zooming in cannot separate points any further: they are all approximate
 * (about 5 km), so the group is shown as a list instead.
 */
export const MAX_ZOOM_DELTA = MIN_BOX_KM * 2 * KM_IN_DEGREES;

export function clusterAction(cluster: Cluster, region: Region, points: readonly MapPoint[]): ClusterAction {
  if (cluster.ids.length === 1) return { type: 'open', id: cluster.ids[0] };
  if (region.longitudeDelta <= MAX_ZOOM_DELTA) return { type: 'list', ids: cluster.ids };

  const members = new Set(cluster.ids);
  const inCluster = points.filter((p) => members.has(p.id));
  const lats = inCluster.map((p) => p.latitude);
  const lngs = inCluster.map((p) => normalizeLongitude(p.longitude));
  const spanLat = Math.max(...lats) - Math.min(...lats);
  const spanLng = Math.max(...lngs) - Math.min(...lngs);
  // Fit the group with some margin, zoom in at least 3x, and never past the useful limit.
  const delta = Math.max(Math.min(Math.max(spanLat, spanLng) * 1.6, region.longitudeDelta / 3), MAX_ZOOM_DELTA);
  return {
    type: 'zoom',
    region: { latitude: cluster.latitude, longitude: cluster.longitude, latitudeDelta: delta, longitudeDelta: delta },
  };
}
