export interface BathRow {
  lat: number;
  lon: number;
  depth_m: number;
  temp_c?: number;
  ts_ms: number;
}

export interface SonarPing {
  ts_ms: number;
  amps: Int32Array;
}

export interface SourceFileMeta {
  fileName: string;
  bytes: number;
}

export type DeviceType = 'quest';

export interface RawScan {
  device: DeviceType;
  bathymetry: BathRow[];
  sonar: SonarPing[];
  source: SourceFileMeta[];
}
