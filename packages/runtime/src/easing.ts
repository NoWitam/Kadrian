/**
 * Easing of a segment (D67): how a value moves from its start `a` to its end
 * `b` while the elapsed time runs from 0 to the span. Every curve is computed
 * with `+ - * /` and comparisons only, in a fixed order and a fixed number of
 * steps, so that every engine that implements IEEE 754 binary64 yields the same
 * bits (D18). Nothing here reads a clock, a tolerance, or a function that the
 * ECMAScript specification leaves approximated (`Math.pow`, `Math.cbrt`, …).
 */
import type { Easing } from '@kadrion/schema';

import { EvaluationError, unsupported } from './errors.js';

/** The control points of a cubic Bézier from (0, 0) to (1, 1) (D67). */
interface Bezier {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

/** The named curves are the cubic Béziers of CSS Easing Functions Level 1. */
const EASE_IN: Bezier = { x1: 0.42, y1: 0, x2: 1, y2: 1 };
const EASE_OUT: Bezier = { x1: 0, y1: 0, x2: 0.58, y2: 1 };
const EASE_IN_OUT: Bezier = { x1: 0.42, y1: 0, x2: 0.58, y2: 1 };

/**
 * The number of bisection steps that solve a Bézier for its parameter (D67.3).
 * After 64 halvings the bracket is narrower than the spacing of binary64 for
 * every parameter above 2^-11; the steps after the midpoint stops moving
 * change nothing, and every step runs, whatever the curve.
 */
export const BISECTION_STEPS = 64;

/**
 * One coordinate of the curve at the parameter `s`, from the control
 * coordinates `c1` and `c2` of that axis: `((a·s + b)·s + c)·s` with
 * `c = 3·c1`, `b = 3·(c2 − c1) − c`, and `a = 1 − c − b`, the power form of
 * `3(1 − s)²s·c1 + 3(1 − s)s²·c2 + s³`, in exactly this order (D67.3).
 */
function coordinate(c1: number, c2: number, s: number): number {
  const c = 3 * c1;
  const b = 3 * (c2 - c1) - c;
  const a = 1 - c - b;
  return ((a * s + b) * s + c) * s;
}

/**
 * The eased progress of a cubic Bézier at the progress `p`, `0 < p < 1`
 * (D67.3): the parameter `s` whose `x(s)` is `p` is bracketed in [0, 1] and
 * halved `BISECTION_STEPS` times — the lower end moves up while `x(mid) < p`,
 * the upper end down otherwise — and `y` is evaluated at the midpoint of the
 * last bracket. Since every step compares the same computed `x(mid)` with `p`,
 * the parameter found never decreases when `p` grows, whatever the rounding
 * of `x` (D67.4).
 */
export function bezierProgress(curve: Bezier, p: number): number {
  let low = 0;
  let high = 1;
  for (let step = 0; step < BISECTION_STEPS; step += 1) {
    const middle = (low + high) / 2;
    if (coordinate(curve.x1, curve.x2, middle) < p) low = middle;
    else high = middle;
  }
  return coordinate(curve.y1, curve.y2, (low + high) / 2);
}

/**
 * The number of jumps a `steps` curve has made at `elapsedUs` of `spanUs`
 * (D67.5): `floor(elapsed · count / span)` at the end of each interval, one
 * more at its start, computed exactly in integers. A span may be half of an
 * odd duration (D56, fade-through-color); both times are then doubled first,
 * which is exact.
 */
export function stepsTaken(
  count: number,
  position: 'start' | 'end',
  elapsedUs: number,
  spanUs: number,
): number {
  const twice = !Number.isInteger(spanUs);
  const elapsed = BigInt(twice ? elapsedUs * 2 : elapsedUs);
  const span = BigInt(twice ? spanUs * 2 : spanUs);
  const jumps = Number((elapsed * BigInt(count)) / span);
  return position === 'start' ? jumps + 1 : jumps;
}

/** One entry per kind of easing of the schema: a kind it gains fails compilation here first. */
const KINDS: Readonly<Record<Easing['kind'], true>> = {
  linear: true,
  hold: true,
  'ease-in': true,
  'ease-out': true,
  'ease-in-out': true,
  'cubic-bezier': true,
  steps: true,
};

/**
 * Refuses an easing outside the schema, which cannot come out of validation: a
 * forged document is reported whatever time is sampled, never skipped (D19).
 */
export function requireEasing(easing: Easing): void {
  const kind: unknown = (easing as { readonly kind?: unknown } | null)?.kind;
  if (typeof kind !== 'string' || !Object.hasOwn(KINDS, kind)) {
    const message = `The document has an unsupported easing, ${JSON.stringify(kind)}.`;
    throw new EvaluationError('invalid-document', message);
  }
}

/** Holds `value` within `[min, max]` by comparisons only; a value inside is returned as it is. */
export function within(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/** The bounds a sampled value is held within when its segment is not linear (D67.6). */
export interface Bounds {
  readonly min: number;
  readonly max: number;
}

/**
 * The value of one channel between `(0, a)` and `(spanUs, b)` at
 * `0 < elapsedUs < spanUs` under `easing` (D18.3, D67):
 *
 * - `linear`: `a + ((b − a) · elapsed) / span`, D18.3 unchanged;
 * - `hold`: `a`, without any arithmetic;
 * - `steps`: `a + ((b − a) · j) / count`, the order of D18.3 with the number
 *   of jumps `j` in place of the elapsed time;
 * - a Bézier: `a + (b − a) · e` with `e` the eased progress at
 *   `p = elapsed / span`.
 *
 * Every curve but `linear` is then held within `bounds`, so that an overshoot
 * never leaves the range of its property.
 */
export function easedValue(
  easing: Easing,
  a: number,
  b: number,
  elapsedUs: number,
  spanUs: number,
  bounds: Bounds,
): number {
  if (easing.kind === 'linear') return a + ((b - a) * elapsedUs) / spanUs;
  if (easing.kind === 'hold') return a;
  if (easing.kind === 'steps') {
    const jumps = stepsTaken(easing.count, easing.position, elapsedUs, spanUs);
    return within(a + ((b - a) * jumps) / easing.count, bounds.min, bounds.max);
  }
  const progress = easedProgress(easing, elapsedUs / spanUs);
  return within(a + (b - a) * progress, bounds.min, bounds.max);
}

/** The eased progress of a Bézier curve, named or given, at `0 < p < 1` (D67.3). */
export function easedProgress(
  easing: Exclude<Easing, { kind: 'linear' | 'hold' | 'steps' }>,
  p: number,
): number {
  switch (easing.kind) {
    case 'ease-in':
      return bezierProgress(EASE_IN, p);
    case 'ease-out':
      return bezierProgress(EASE_OUT, p);
    case 'ease-in-out':
      return bezierProgress(EASE_IN_OUT, p);
    case 'cubic-bezier':
      return bezierProgress(easing, p);
    default:
      return unsupported(easing, 'kind');
  }
}
