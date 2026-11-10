/**
 * The orientation of a video (D81): the quarter turn and the mirror its
 * container's display matrix asks for, and the one transformation of decoded
 * pixels that both hosts apply after their conversion to RGB. The Player
 * reads the matrix with Mediabunny, the Producer with the pinned ffprobe, and
 * both turn it into an orientation and turn the picture by this module, so the
 * pixels cannot differ by how a host rotates: a quarter turn and a mirror only
 * move whole pixels. A matrix that is not a quarter turn, with or without a
 * mirror, has no orientation (`null`) and is refused by both hosts.
 *
 * The matrix is the one of ISO BMFF (`tkhd`) and of FFmpeg's display matrix,
 * row-major `[a, b, u, c, d, v, x, y, w]` in real numbers: a point `(p, q)` of
 * the decoded picture, `x` to the right and `y` down, is shown at
 * `(a·p + c·q + x, b·p + d·q + y)`. The translation `x`, `y` is ignored, as
 * FFmpeg and Mediabunny ignore it: the picture is shown from its top-left
 * corner. Pure: no DOM, no clock; the hosts call it, the render page does not.
 */

/** A clockwise turn of the picture, in degrees. */
export type VideoRotation = 0 | 90 | 180 | 270;

/** The orientation of a video: a clockwise turn, then a mirror about the vertical axis. */
export interface VideoOrientation {
  readonly rotation: VideoRotation;
  /** Whether the picture is mirrored left to right after the turn. */
  readonly flipped: boolean;
}

/** The orientation of a picture shown as it was decoded. */
export const UPRIGHT: VideoOrientation = Object.freeze({ rotation: 0, flipped: false });

/**
 * The eight orientations by the linear part `[a, b, c, d]` of their matrix:
 * the turn of Mediabunny's `getRotation` and the mirror of its `getFlip`.
 */
const ORIENTATIONS: readonly (readonly [readonly number[], VideoOrientation])[] = [
  [[1, 0, 0, 1], UPRIGHT],
  [[0, 1, -1, 0], Object.freeze({ rotation: 90, flipped: false })],
  [[-1, 0, 0, -1], Object.freeze({ rotation: 180, flipped: false })],
  [[0, -1, 1, 0], Object.freeze({ rotation: 270, flipped: false })],
  [[-1, 0, 0, 1], Object.freeze({ rotation: 0, flipped: true })],
  [[0, 1, 1, 0], Object.freeze({ rotation: 90, flipped: true })],
  [[1, 0, 0, -1], Object.freeze({ rotation: 180, flipped: true })],
  [[0, -1, -1, 0], Object.freeze({ rotation: 270, flipped: true })],
];

/**
 * The orientation a display matrix asks for, or `null` when it is not exactly
 * a quarter turn, with or without a mirror: any other angle, a scale, a shear,
 * or a perspective (`u`, `v` other than 0, `w` other than 1). The values are
 * compared exactly; ISO BMFF stores them in fixed point, so a quarter turn is
 * exact. A host refuses a video without an orientation.
 */
export function videoOrientation(matrix: readonly number[]): VideoOrientation | null {
  if (matrix.length !== 9) return null;
  const [a, b, u, c, d, v, , , w] = matrix;
  if (u !== 0 || v !== 0 || w !== 1) return null;
  const linear = [a, b, c, d];
  const found = ORIENTATIONS.find(([entries]) =>
    entries.every((entry, at) => linear[at] === entry),
  );
  return found?.[1] ?? null;
}

/** The linear part `[a, b, c, d]` of the matrix of an orientation. */
function linearOf(orientation: VideoOrientation): readonly number[] {
  const found = ORIENTATIONS.find(
    ([, candidate]) =>
      candidate.rotation === orientation.rotation && candidate.flipped === orientation.flipped,
  );
  if (found === undefined) throw new RangeError('Not an orientation of a video.');
  return found[0];
}

/** The size of a decoded picture once it is oriented: a quarter turn swaps the sides. */
export function orientedSize(
  width: number,
  height: number,
  orientation: VideoOrientation,
): { readonly width: number; readonly height: number } {
  return orientation.rotation % 180 === 0 ? { width, height } : { width: height, height: width };
}

/**
 * Orients a picture of packed RGB, three bytes a pixel, `width × height` as
 * it was decoded: pixel `(i, j)` moves to `(a·i + c·j, b·i + d·j)`, shifted
 * into the oriented picture. The upright orientation returns `rgb` itself;
 * every other one a new array of the same length.
 */
export function orientRgb(
  rgb: Uint8Array,
  width: number,
  height: number,
  orientation: VideoOrientation,
): Uint8Array {
  if (rgb.length !== width * height * 3) {
    throw new RangeError(
      `A picture of ${String(width)}x${String(height)} has ${String(width * height * 3)} bytes, not ${String(rgb.length)}.`,
    );
  }
  if (orientation.rotation === 0 && !orientation.flipped) return rgb;
  const [a = 1, b = 0, c = 0, d = 1] = linearOf(orientation);
  const out = orientedSize(width, height, orientation);
  // The shift that brings the turned picture back to (0, 0).
  const x0 = (a < 0 ? width - 1 : 0) + (c < 0 ? height - 1 : 0);
  const y0 = (b < 0 ? width - 1 : 0) + (d < 0 ? height - 1 : 0);
  const oriented = new Uint8Array(rgb.length);
  for (let j = 0; j < height; j += 1) {
    for (let i = 0; i < width; i += 1) {
      const from = (j * width + i) * 3;
      const to = ((b * i + d * j + y0) * out.width + (a * i + c * j + x0)) * 3;
      oriented[to] = rgb[from] as number;
      oriented[to + 1] = rgb[from + 1] as number;
      oriented[to + 2] = rgb[from + 2] as number;
    }
  }
  return oriented;
}
