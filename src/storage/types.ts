import type { LayerBundle, PipelineOptions } from '../analysis/types';
import type { DeviceType } from '../analysis/parsers/types';

export type BaseLayerId = 'osm' | 'satellite';

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
