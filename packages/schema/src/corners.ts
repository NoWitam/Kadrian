/**
 * The geometry of the four corners of a node (D91.1), shared by the validation
 * of a document and by the runtime: the corners of a node's box moved by its
 * own transform and by their offsets, and whether four points form a convex
 * quadrilateral with a non-zero area in their order.
 *
 * Everything here is `+ − × /` and comparisons (D24, D91.1): the cosine and the
 * sine of a rotation are series on decimal constants, not `Math.cos`, so every
 * engine computes the same bits. A rotation that is a whole number of quarter
 * turns gives an exact 0, 1, or -1, so a box that is not turned, or turned by a
 * quarter, keeps its corners exactly.
 */

/** A point or an offset in composition pixels (D15). */
export interface CornerPoint {
  readonly x: number;
  readonly y: number;
}

/** The offsets of the four corners of a node's box (D91.1), as the document stores them. */
export interface CornerOffsets {
  readonly topLeft: CornerPoint;
  readonly topRight: CornerPoint;
  readonly bottomRight: CornerPoint;
  readonly bottomLeft: CornerPoint;
}

/** The transform of a node that moves its corners before their offsets (D15, D68, D89.3). */
export interface CornerTransform {
  readonly position: CornerPoint;
  readonly scale: CornerPoint;
  readonly rotation: number;
  /** In per mille of the sides of the box (D68). */
  readonly origin: CornerPoint;
  readonly flip: { readonly x: boolean; readonly y: boolean };
}

/** The four moved corners: top-left, top-right, bottom-right, bottom-left. */
export type Quadrilateral = readonly [CornerPoint, CornerPoint, CornerPoint, CornerPoint];

/** The order of the corners, the order of a quadrilateral (D91.1). */
export const CORNER_KEYS = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'] as const;

/** Whether the four offsets are zero vectors: no quadrilateral (D91.1). */
export function hasCorners(corners: CornerOffsets): boolean {
  return CORNER_KEYS.some((key) => corners[key].x !== 0 || corners[key].y !== 0);
}

/** π / 180, the radians of one degree, as the double nearest to it. */
const RADIANS_PER_DEGREE = 0.017453292519943295;

/**
 * The cosine and the sine of an angle `x` in radians, |x| ≤ π / 4, by their
 * Taylor series to the term of x¹⁸ and x¹⁷, whose next terms lie below the
 * precision of a double there. Horner's form, `+ − × /` only.
 */
function series(x: number): { readonly cos: number; readonly sin: number } {
  const x2 = x * x;
  const cos =
    1 -
    (x2 / 2) *
      (1 -
        (x2 / 12) *
          (1 -
            (x2 / 30) *
              (1 -
                (x2 / 56) *
                  (1 -
                    (x2 / 90) *
                      (1 - (x2 / 132) * (1 - (x2 / 182) * (1 - (x2 / 240) * (1 - x2 / 306))))))));
  const sin =
    x *
    (1 -
      (x2 / 6) *
        (1 -
          (x2 / 20) *
            (1 -
              (x2 / 42) *
                (1 -
                  (x2 / 72) *
                    (1 - (x2 / 110) * (1 - (x2 / 156) * (1 - (x2 / 210) * (1 - x2 / 272))))))));
  return { cos, sin };
}

/**
 * The cosine and the sine of a rotation in degrees, clockwise in the y-down
 * space of D15 as CSS `rotate()` turns (D68). The angle is reduced to a
 * quarter turn and an eighth by comparisons and exact subtractions, so that a
 * whole number of quarter turns is exact.
 */
export function cosSinOfDegrees(degrees: number): { readonly cos: number; readonly sin: number } {
  // `%` of two doubles is exact; a turn in [0, 360) after it.
  let turn = degrees % 360;
  if (turn < 0) turn += 360;
  let quarter = 0;
  while (turn >= 90) {
    turn -= 90;
    quarter += 1;
  }
  // `turn` in [0, 90): beyond an eighth, the complement swaps cosine and sine.
  const swapped = turn > 45;
  const reduced = series((swapped ? 90 - turn : turn) * RADIANS_PER_DEGREE);
  const cos = swapped ? reduced.sin : reduced.cos;
  const sin = swapped ? reduced.cos : reduced.sin;
  // A quarter turn maps (cos, sin) to (−sin, cos); `+ 0` reports a `-0` as 0.
  switch (quarter) {
    case 0:
      return { cos: cos + 0, sin: sin + 0 };
    case 1:
      return { cos: -sin + 0, sin: cos + 0 };
    case 2:
      return { cos: -cos + 0, sin: -sin + 0 };
    default:
      return { cos: sin + 0, sin: -cos + 0 };
  }
}

/**
 * The corners of a box of `width` by `height` moved by a node's own transform
 * into its parent's space (D15, D68, D89.3), and then each by its offset
 * (D91.1): mirrored in the box by the flip, scaled and rotated about the
 * origin, and placed at the position. Top-left, top-right, bottom-right,
 * bottom-left.
 */
export function movedCorners(
  box: { readonly width: number; readonly height: number },
  transform: CornerTransform,
  corners: CornerOffsets,
): Quadrilateral {
  const { width, height } = box;
  const { cos, sin } = cosSinOfDegrees(transform.rotation);
  const pivotX = (transform.origin.x / 1000) * width;
  const pivotY = (transform.origin.y / 1000) * height;
  const move = (x: number, y: number, offset: CornerPoint): CornerPoint => {
    const flippedX = transform.flip.x ? width - x : x;
    const flippedY = transform.flip.y ? height - y : y;
    const scaledX = (flippedX - pivotX) * transform.scale.x;
    const scaledY = (flippedY - pivotY) * transform.scale.y;
    return {
      x: transform.position.x + pivotX + (scaledX * cos - scaledY * sin) + offset.x,
      y: transform.position.y + pivotY + (scaledX * sin + scaledY * cos) + offset.y,
    };
  };
  return [
    move(0, 0, corners.topLeft),
    move(width, 0, corners.topRight),
    move(width, height, corners.bottomRight),
    move(0, height, corners.bottomLeft),
  ];
}

/**
 * Whether four points, in their order, form a convex quadrilateral with a
 * non-zero area (D91.1): the cross product of every two consecutive edges is
 * strictly positive, or every one strictly negative (a flip mirrors the
 * order). A concave or self-intersecting quadrilateral has products of both
 * signs; three points on one line or two at one point a zero product.
 */
export function isConvexQuadrilateral(points: Quadrilateral): boolean {
  let positive = 0;
  let negative = 0;
  for (let index = 0; index < 4; index += 1) {
    const a = points[index] as CornerPoint;
    const b = points[(index + 1) % 4] as CornerPoint;
    const c = points[(index + 2) % 4] as CornerPoint;
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (cross > 0) positive += 1;
    else if (cross < 0) negative += 1;
    else return false;
  }
  return positive === 4 || negative === 4;
}
