import type { SonarPing } from '../../src/analysis/parsers/types';

export interface MakePingOpts {
  ts: number;
  /** Length of the amplitude array. */
  bins: number;
  /** Background noise floor amplitude (filled across ringdown..bottom region). */
  noise?: number;
  /** Ringdown bin range (0..30 by default) — sets to a high value to mimic transducer. */
  ringdownAmp?: number;
  /** Bottom return: a peak of N bins of high amplitude at the end. */
  bottomBins?: number;
  bottomAmp?: number;
  /** Optional: insert a fish cluster (run length and amplitude) at distance N bins above the bottom. */
  fish?: { binsAboveBottom: number; runLength: number; amp: number };
  /** Optional: insert a weed band (run length, threshold-meeting amplitude) immediately above the bottom. */
  weed?: { runLength: number; amp: number };
}

export function makePing(opts: MakePingOpts): SonarPing {
  const amps = new Int32Array(opts.bins);
  const noise = opts.noise ?? 5;
  const ring = opts.ringdownAmp ?? 1500;
  const bottomBins = opts.bottomBins ?? 10;
  const bottomAmp = opts.bottomAmp ?? 1500;

  // Ringdown
  for (let i = 0; i < Math.min(30, opts.bins); i++) amps[i] = ring;
  // Mid-water noise
  for (let i = 30; i < opts.bins - bottomBins; i++) amps[i] = noise;
  // Bottom band at the end
  for (let i = opts.bins - bottomBins; i < opts.bins; i++) amps[i] = bottomAmp;

  if (opts.weed) {
    const start = opts.bins - bottomBins - opts.weed.runLength;
    for (let i = start; i < opts.bins - bottomBins; i++) amps[i] = opts.weed.amp;
  }
  if (opts.fish) {
    const center = opts.bins - bottomBins - opts.fish.binsAboveBottom;
    for (
      let i = center - Math.floor(opts.fish.runLength / 2);
      i < center + Math.ceil(opts.fish.runLength / 2);
      i++
    ) {
      if (i >= 30 && i < opts.bins - bottomBins) amps[i] = opts.fish.amp;
    }
  }

  return { ts_ms: opts.ts, amps };
}
