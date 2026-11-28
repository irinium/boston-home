import type { Cluster } from '@/features/map/domain/cluster';
import type { Region } from '@/features/map/domain/geo';

export type MapCanvasProps = {
  initialRegion: Region;
  /** When set, the map animates to this region. */
  focus: Region | null;
  clusters: Cluster[];
  onRegionChange(region: Region): void;
  onPressCluster(cluster: Cluster): void;
  /** Accessibility label of a marker, e.g. "3 listings". */
  markerLabel(count: number): string;
};
