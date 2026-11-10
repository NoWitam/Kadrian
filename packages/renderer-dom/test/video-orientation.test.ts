/**
 * The orientation of a video (D81) on matrices and pictures built here: the
 * eight quarter turns, with and without a mirror, named as Mediabunny names
 * them; every other matrix refused; and the pixels of a picture moved where
 * the matrix shows them. That this is the orientation FFmpeg shows, and that
 * the Player and the Producer give the same pixels with it, is checked in the
 * pinned environment (tests/pinned/video.pinned.test.ts,
 * tests/pinned/player-video.pinned.test.ts).
 */
import { describe, expect, it } from 'vitest';

import {
  orientedSize,
  orientRgb,
  UPRIGHT,
  videoOrientation,
  type VideoOrientation,
} from '../src/index.js';

/** A display matrix `[a, b, 0, c, d, 0, x, y, 1]`. */
const matrix = (a: number, b: number, c: number, d: number, x = 0, y = 0): number[] => [
  a,
  b,
  0,
  c,
  d,
  0,
  x,
  y,
  1,
];

/** The matrices FFmpeg writes for `-display_rotation` and `-display_hflip`, and what they mean. */
const QUARTER_TURNS: readonly (readonly [string, number[], VideoOrientation])[] = [
  ['none', matrix(1, 0, 0, 1), { rotation: 0, flipped: false }],
  ['-display_rotation 270', matrix(0, 1, -1, 0), { rotation: 90, flipped: false }],
  ['-display_rotation 180', matrix(-1, 0, 0, -1), { rotation: 180, flipped: false }],
  ['-display_rotation 90', matrix(0, -1, 1, 0), { rotation: 270, flipped: false }],
  ['-display_hflip', matrix(-1, 0, 0, 1), { rotation: 0, flipped: true }],
  ['-display_rotation 90 -display_vflip', matrix(0, 1, 1, 0), { rotation: 90, flipped: true }],
  ['-display_vflip', matrix(1, 0, 0, -1), { rotation: 180, flipped: true }],
  ['-display_rotation 90 -display_hflip', matrix(0, -1, -1, 0), { rotation: 270, flipped: true }],
];

/** A picture of `width × height` whose pixel `(i, j)` is `[i, j, 7]`. */
function picture(width: number, height: number): Uint8Array {
  const rgb = new Uint8Array(width * height * 3);
  for (let j = 0; j < height; j += 1) {
    for (let i = 0; i < width; i += 1) rgb.set([i, j, 7], (j * width + i) * 3);
  }
  return rgb;
}

/** The pixel at `(x, y)` of a picture `width` wide. */
const pixel = (rgb: Uint8Array, width: number, x: number, y: number): number[] => [
  ...rgb.subarray((y * width + x) * 3, (y * width + x) * 3 + 3),
];

describe('the orientation of a display matrix (D81)', () => {
  it.each(QUARTER_TURNS)('reads %s as its turn and mirror', (_, given, expected) => {
    expect(videoOrientation(given)).toEqual(expected);
  });

  it('ignores the translation, as FFmpeg and Mediabunny do', () => {
    expect(videoOrientation(matrix(0, -1, 1, 0, 0, 64))).toEqual({ rotation: 270, flipped: false });
  });

  it.each([
    ['45°', matrix(0.70709228515625, -0.70709228515625, 0.70709228515625, 0.70709228515625)],
    ['a scale', matrix(2, 0, 0, 2)],
    ['a shear', matrix(1, 1, 0, 1)],
    ['nothing', matrix(0, 0, 0, 0)],
    ['a perspective', [1, 0, 0.5, 0, 1, 0, 0, 0, 1]],
    ['another w', [1, 0, 0, 0, 1, 0, 0, 0, 2]],
    ['eight numbers', [1, 0, 0, 0, 1, 0, 0, 0]],
  ])('refuses %s', (_, given) => {
    expect(videoOrientation(given)).toBeNull();
  });
});

describe('the orientation of a picture (D81)', () => {
  it('keeps the picture as it is when upright', () => {
    const rgb = picture(3, 2);
    expect(orientRgb(rgb, 3, 2, UPRIGHT)).toBe(rgb);
    expect(orientedSize(3, 2, UPRIGHT)).toEqual({ width: 3, height: 2 });
  });

  it('turns a picture a quarter turn clockwise', () => {
    // A B C       D A
    // D E F  →    E B
    //             F C
    const turned = orientRgb(picture(3, 2), 3, 2, { rotation: 90, flipped: false });
    expect(orientedSize(3, 2, { rotation: 90, flipped: false })).toEqual({ width: 2, height: 3 });
    expect([0, 1, 2].map((y) => [0, 1].map((x) => pixel(turned, 2, x, y)))).toEqual([
      [
        [0, 1, 7],
        [0, 0, 7],
      ],
      [
        [1, 1, 7],
        [1, 0, 7],
      ],
      [
        [2, 1, 7],
        [2, 0, 7],
      ],
    ]);
  });

  it.each(QUARTER_TURNS)(
    'shows every pixel of %s where its matrix puts it, shifted to the origin',
    (_, given, orientation) => {
      const [a = 1, b = 0, , c = 0, d = 1] = given;
      const width = 5;
      const height = 3;
      const turned = orientRgb(picture(width, height), width, height, orientation);
      const size = orientedSize(width, height, orientation);
      // The corners of the turned picture, where the matrix sends them, give the shift.
      const corners = [
        [0, 0],
        [width - 1, 0],
        [0, height - 1],
        [width - 1, height - 1],
      ].map(([p = 0, q = 0]) => [a * p + c * q, b * p + d * q]);
      const x0 = -Math.min(...corners.map(([x = 0]) => x));
      const y0 = -Math.min(...corners.map(([, y = 0]) => y));
      for (let q = 0; q < height; q += 1) {
        for (let p = 0; p < width; p += 1) {
          const x = a * p + c * q + x0;
          const y = b * p + d * q + y0;
          expect(pixel(turned, size.width, x, y)).toEqual([p, q, 7]);
        }
      }
    },
  );

  it('refuses bytes that are not a picture of the size given', () => {
    expect(() => orientRgb(new Uint8Array(5), 2, 1, { rotation: 90, flipped: false })).toThrow(
      RangeError,
    );
  });
});
