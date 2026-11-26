/**
 * The four corners of a node (D91.1): the homography that takes the box of a
 * node onto the quadrilateral of its corners, moved by its own transform and
 * by their offsets, as the sixteen numbers of a CSS `matrix3d`.
 *
 * The square onto a quadrilateral has a closed form (Heckbert, 1989); the box
 * of `width` by `height` is the unit square scaled. Everything is `+ − × /`
 * and comparisons, the cosine and the sine of the rotation included
 * (`movedCorners`, D24), so every engine computes the same bits.
 */
import {
  isConvexQuadrilateral,
  movedCorners,
  type CornerOffsets,
  type CornerTransform,
  type Quadrilateral,
} from '@kadrion/schema';

import type { Homography } from './state.js';

/**
 * The homography that takes the box of `width` by `height`, in its own
 * pixels with the top-left corner at 0, 0, onto a convex quadrilateral:
 * 0, 0 onto its first point, `width`, 0 onto the second, `width`, `height`
 * onto the third, and 0, `height` onto the fourth. Column by column, as CSS
 * `matrix3d` takes it: a point x, y lands at (m0 x + m4 y + m12, m1 x + m5 y +
 * m13) / (m3 x + m7 y + m15). A parallelogram gives an affine map, with 0 in
 * m3 and m7. The quadrilateral must be convex with a non-zero area.
 */
export function boxOntoQuadrilateral(
  box: { readonly width: number; readonly height: number },
  [p0, p1, p2, p3]: Quadrilateral,
): Homography {
  const sumX = p0.x - p1.x + p2.x - p3.x;
  const sumY = p0.y - p1.y + p2.y - p3.y;
  const dx1 = p1.x - p2.x;
  const dx2 = p3.x - p2.x;
  const dy1 = p1.y - p2.y;
  const dy2 = p3.y - p2.y;
  const denominator = dx1 * dy2 - dx2 * dy1;
  const g = (sumX * dy2 - dx2 * sumY) / denominator;
  const h = (dx1 * sumY - sumX * dy1) / denominator;
  // The unit square onto the quadrilateral, then u = x / width and v = y / height.
  const a = p1.x - p0.x + g * p1.x;
  const b = p3.x - p0.x + h * p3.x;
  const d = p1.y - p0.y + g * p1.y;
  const e = p3.y - p0.y + h * p3.y;
  const { width, height } = box;
  // `+ 0` reports a `-0` as 0, as everywhere in the state.
  return [
    a / width + 0,
    d / width + 0,
    0,
    g / width + 0,
    b / height + 0,
    e / height + 0,
    0,
    h / height + 0,
    0,
    0,
    1,
    0,
    p0.x + 0,
    p0.y + 0,
    0,
    1,
  ];
}

/**
 * The homography of a node with corners at one instant (D91.1): `null` when
 * its quadrilateral is not convex with a non-zero area, and the node draws
 * nothing then.
 */
export function cornersHomography(
  box: { readonly width: number; readonly height: number },
  transform: CornerTransform,
  corners: CornerOffsets,
): Homography | null {
  const quadrilateral = movedCorners(box, transform, corners);
  return isConvexQuadrilateral(quadrilateral) ? boxOntoQuadrilateral(box, quadrilateral) : null;
}
