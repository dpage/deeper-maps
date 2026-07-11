import type { LayerBundle, PipelineOptions } from '../analysis/types';
import type { DeviceType } from '../analysis/parsers/types';

export type BaseLayerId = 'osm' | 'satellite';

/**
 * Default cap on how many sweet-spot markers are shown at once. A busy lake can
 * categorise hundreds of cells as sweet spots, which renders as an unreadable
 * blanket of circles; the map shows only the best `maxSweetSpots` within the
 * current viewport (see `selectTopSweetSpots`). Persisted per-scan.
 */
export const DEFAULT_MAX_SWEET_SPOTS = 12;

export interface LayerVisibility {
  bathymetry: boolean;
  weed: boolean;
  fishDensity: boolean;
  sweetSpots: boolean;
  temperature: boolean;
}

export interface PersistedFileMeta {
  name: string;
  byteSize: number;
  sha256: string;
}

export interface StoredScan {
  id: string;
  name: string;
  deviceType: DeviceType;
  contentHash: string;
  createdAt: number;
  updatedAt: number;
  fileMeta: PersistedFileMeta[];
  thresholds: PipelineOptions;
  layerVisibility: LayerVisibility;
  /**
   * Maximum number of sweet-spot markers to show at once (best-first, within
   * the current viewport). Optional for backward compatibility with scans
   * persisted before this field existed; the store normalises a missing value
   * to {@link DEFAULT_MAX_SWEET_SPOTS} on hydrate.
   */
  maxSweetSpots?: number;
}

export interface StoredRawFile {
  scanId: string;
  fileName: string;
  blob: Blob;
}

export interface StoredScanResults {
  scanId: string;
  bundleVersion: number;
  builtAt: number;
  bundle: LayerBundle;
}
