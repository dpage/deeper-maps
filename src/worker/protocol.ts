import type { LayerBundle, PipelineOptions } from '../analysis/types';

export type PipelineStage =
  | 'parse'
  | 'cleanBathymetry'
  | 'analysePings'
  | 'aggregateCells'
  | 'categoriseCells'
  | 'buildLayers';

export interface RawFileBytes {
  fileName: string;
  bytes: Uint8Array;
}

export interface AnalyseRequest {
  kind: 'analyse';
  scanId: string;
  rawFiles: RawFileBytes[];
  options: PipelineOptions;
}

export interface RecomputeRequest {
  kind: 'recompute';
  scanId: string;
  options: PipelineOptions;
}

export interface CancelRequest {
  kind: 'cancel';
  scanId: string;
}

export type WorkerRequest = AnalyseRequest | RecomputeRequest | CancelRequest;

export interface ProgressResponse {
  kind: 'progress';
  scanId: string;
  stage: PipelineStage;
  processed: number;
  total: number;
}

export interface LayerBundleResponse {
  kind: 'layerBundle';
  scanId: string;
  bundle: LayerBundle;
  warnings: string[];
}

export interface ErrorResponse {
  kind: 'error';
  scanId: string;
  message: string;
  stack?: string;
}

export interface CancelledResponse {
  kind: 'cancelled';
  scanId: string;
}

export type WorkerResponse =
  | ProgressResponse
  | LayerBundleResponse
  | ErrorResponse
  | CancelledResponse;
