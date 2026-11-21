/**
 * The conversion of one decoded frame (D51.4, D87.2): the planes of a frame
 * as the decoder laid them out, converted to RGB by FFmpeg's own conversion
 * (`yuv.ts`), turned as the container asks by the function both hosts use
 * (D81), and, for a bitmap, given an alpha of 255. The path of D51 and the
 * workers of D87 both call it, so a frame of a stream and a sought frame are
 * the same pixels. Pure: no DOM and no clock, so the worker's bundle holds
 * it with what it imports.
 */
import { orientedSize, orientRgb, type VideoOrientation } from '@kadrion/renderer-dom';

import { yuv420ToRgb, type YuvMatrix } from './yuv.js';

/** What the conversion of one frame needs: its planes and the facts of its track. */
export interface ConvertJob {
  /** The coded size, which the decoder gives. */
  readonly width: number;
  readonly height: number;
  readonly matrix: YuvMatrix;
  readonly fullRange: boolean;
  readonly orientation: VideoOrientation;
  /** The I420 planes as the decoder laid them out (`VideoFrame.copyTo`). */
  readonly data: Uint8Array;
  readonly layout: readonly { readonly offset: number; readonly stride: number }[];
}

/** The packed RGB of a frame's planes, by FFmpeg's own conversion (D51.4), before D81. */
export function planesToRgb(job: ConvertJob): Uint8Array {
  const [y, u, v] = job.layout;
  if (y === undefined || u === undefined || v === undefined) {
    throw new RangeError('A frame has no three planes.');
  }
  const { data, width, height } = job;
  const chromaHeight = (height + 1) >> 1;
  return yuv420ToRgb(
    {
      width,
      height,
      y: data.subarray(y.offset, y.offset + y.stride * height),
      yStride: y.stride,
      u: data.subarray(u.offset, u.offset + u.stride * chromaHeight),
      uStride: u.stride,
      v: data.subarray(v.offset, v.offset + v.stride * chromaHeight),
      vStride: v.stride,
    },
    job.matrix,
    job.fullRange,
  );
}

/** The packed RGB of a frame as it is shown: converted, then turned (D81). */
export function shownRgb(job: ConvertJob): { width: number; height: number; rgb: Uint8Array } {
  const shown = orientedSize(job.width, job.height, job.orientation);
  const rgb = orientRgb(planesToRgb(job), job.width, job.height, job.orientation);
  return { width: shown.width, height: shown.height, rgb };
}

/**
 * The RGBA of a frame as it is shown, an alpha of 255 added to each pixel
 * (D87.2): the bytes of the bitmap a worker makes, nothing else changed.
 */
export function shownRgba(job: ConvertJob): {
  width: number;
  height: number;
  rgba: Uint8ClampedArray<ArrayBuffer>;
} {
  const { width, height, rgb } = shownRgb(job);
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let from = 0, to = 0; from < rgb.length; from += 3, to += 4) {
    rgba[to] = rgb[from] as number;
    rgba[to + 1] = rgb[from + 1] as number;
    rgba[to + 2] = rgb[from + 2] as number;
    rgba[to + 3] = 255;
  }
  return { width, height, rgba };
}
