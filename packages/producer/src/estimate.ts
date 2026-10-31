/**
 * What `kadrion estimate` renders (D48.5): one segment of `samples` frames from
 * the middle of the composition, which is a range job like any other, so the
 * measurement covers the page, the frame loop, and the encoder. The plan is
 * pure; the CLI measures it with its own clock, and nothing of it reaches an
 * output.
 */
import { frameCount, frameToTimeUs } from '@kadrion/schema';

import { ProducerError } from './errors.js';
import { validated } from './render.js';
import { checkedSegmentFrames, segmentsOf } from './segments.js';

/** The frames an estimate renders unless the host asks for another number. */
export const DEFAULT_ESTIMATE_SAMPLES = 10;

export interface EstimatePlan {
  /** The range to render, with `samples` as its segment length (D47.2). */
  readonly range: { readonly fromUs: number; readonly toUs: number };
  /** The segment length of the measurement: the number of sampled frames. */
  readonly sampleSegmentFrames: number;
  /** The frames the range holds: always `samples`. */
  readonly frames: number;
  /** The segment length the host renders with (D47.1). */
  readonly segmentFrames: number;
  /** The segments of the whole composition at that length. */
  readonly segments: number;
}

/**
 * The range an estimate renders: the middle segment of the grid whose segment
 * length is `samples`. At least two frames are needed to measure the time of
 * one; a composition with fewer frames, or fewer samples, is refused.
 */
export function estimatePlan(
  document: unknown,
  samples: number = DEFAULT_ESTIMATE_SAMPLES,
  segmentFrames?: number,
): EstimatePlan {
  const composition = validated(document);
  const length = checkedSegmentFrames(segmentFrames);
  const total = frameCount(composition.durationUs, composition.fps);
  if (!Number.isSafeInteger(samples) || samples < 2 || samples > total) {
    throw new ProducerError(
      'range-invalid',
      `An estimate samples 2 to ${String(total)} frames of this composition, got ${String(samples)}.`,
    );
  }
  // The middle segment of the grid, counted without the last one, which may be
  // shorter: every other segment holds exactly `samples` frames (D47.1).
  const grid = segmentsOf(composition, samples);
  const pick = grid[Math.floor((grid.length - 1) / 2)];
  if (pick === undefined) throw new ProducerError('range-invalid', 'The composition has no frame.');
  const end = pick.firstFrame + pick.frameCount;
  return {
    range: {
      fromUs: frameToTimeUs(pick.firstFrame, composition.fps),
      toUs: end >= total ? composition.durationUs : frameToTimeUs(end, composition.fps),
    },
    sampleSegmentFrames: samples,
    frames: pick.frameCount,
    segmentFrames: length,
    segments: segmentsOf(composition, length).length,
  };
}
